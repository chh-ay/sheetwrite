//! A bounded lexer and parser for the M expression subset that saved queries use,
//! following the M language specification:
//! https://learn.microsoft.com/powerquery-m/m-spec-lexical-structure
//! https://learn.microsoft.com/powerquery-m/m-spec-consolidated-grammar
//!
//! The parser builds a syntax tree and nothing else. Forms outside the subset
//! (functions, `if`, `try`, `meta`, and others) are syntax the importer reports
//! as unsupported; they are never evaluated.

use std::ops::Range;

/// Nesting deeper than this is rejected, so hostile text cannot exhaust the stack.
const MAX_DEPTH: usize = 128;
/// Bounds the work for one section document.
const MAX_TOKENS: usize = 1 << 20;
const HEX_RADIX: u32 = 16;
const SHORT_ESCAPE_DIGITS: usize = 4;
const LONG_ESCAPE_DIGITS: usize = 8;

#[derive(Clone, Debug, PartialEq)]
enum Token {
    Identifier(String),
    Text(String),
    Number(f64),
    Symbol(&'static str),
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Expr {
    Null,
    Logical(bool),
    Number(f64),
    Text(String),
    Identifier(String),
    List(Vec<Expr>),
    Record(Vec<(String, Expr)>),
    /// `target[name]`; an implicit `[name]` inside `each` has no target.
    Field(Option<Box<Expr>>, String),
    /// `target{selector}`
    Item(Box<Expr>, Box<Expr>),
    Call(Box<Expr>, Vec<Expr>),
    Each(Box<Expr>),
    Let(Vec<(String, Expr)>, Box<Expr>),
    Not(Box<Expr>),
    Negate(Box<Expr>),
    Binary(&'static str, Box<Expr>, Box<Expr>),
    /// A primitive type such as `type text`, with `nullable` folded in.
    Type(String),
    Error(Box<Expr>),
}

/// One section member with the byte range of its text.
#[derive(Debug)]
pub(crate) struct Member {
    pub name: String,
    pub body: Result<Expr, &'static str>,
    pub span: Range<usize>,
}

struct Lexer<'a> {
    text: &'a str,
    offset: usize,
}

fn is_identifier_start(character: char) -> bool {
    character == '_' || character.is_alphabetic()
}

fn is_identifier_part(character: char) -> bool {
    character == '_' || character.is_alphanumeric()
}

impl Lexer<'_> {
    fn peek(&self) -> Option<char> {
        self.text.get(self.offset..)?.chars().next()
    }

    fn peek_at(&self, ahead: usize) -> Option<char> {
        self.text.get(self.offset..)?.chars().nth(ahead)
    }

    fn advance(&mut self) -> Option<char> {
        let character = self.peek()?;
        self.offset += character.len_utf8();
        Some(character)
    }

    fn skip_trivia(&mut self) -> Result<(), &'static str> {
        loop {
            match (self.peek(), self.peek_at(1)) {
                (Some(character), _) if character.is_whitespace() => {
                    self.advance();
                }
                (Some('/'), Some('/')) => {
                    while self.peek().is_some_and(|character| character != '\n') {
                        self.advance();
                    }
                }
                (Some('/'), Some('*')) => {
                    self.offset += 2;
                    let end = self
                        .text
                        .get(self.offset..)
                        .and_then(|rest| rest.find("*/"))
                        .ok_or("syntax")?;
                    self.offset += end + 2;
                }
                _ => return Ok(()),
            }
        }
    }

    /// Text after the opening quote, up to the closing quote, with escapes decoded.
    fn text_literal(&mut self) -> Result<String, &'static str> {
        let mut value = String::new();

        loop {
            match self.advance().ok_or("syntax")? {
                '"' if self.peek() == Some('"') => {
                    self.advance();
                    value.push('"');
                }
                '"' => return Ok(value),
                '#' if self.peek() == Some('(') => {
                    self.advance();
                    self.escape(&mut value)?;
                }
                other => value.push(other),
            }
        }
    }

    fn escape(&mut self, value: &mut String) -> Result<(), &'static str> {
        let rest = self.text.get(self.offset..).ok_or("syntax")?;
        let end = rest.find(')').ok_or("syntax")?;
        let body = rest.get(..end).ok_or("syntax")?;

        for part in body.split(',') {
            match part {
                "cr" => value.push('\r'),
                "lf" => value.push('\n'),
                "tab" => value.push('\t'),
                "#" => value.push('#'),
                hex if hex.len() == SHORT_ESCAPE_DIGITS || hex.len() == LONG_ESCAPE_DIGITS => {
                    let code = u32::from_str_radix(hex, HEX_RADIX).map_err(|_| "syntax")?;
                    value.push(char::from_u32(code).ok_or("syntax")?);
                }
                _ => return Err("syntax"),
            }
        }

        self.offset += end + 1;
        Ok(())
    }

    fn number(&mut self) -> Result<f64, &'static str> {
        let start = self.offset;
        if self.peek() == Some('0') && matches!(self.peek_at(1), Some('x' | 'X')) {
            self.offset += 2;
            let digits = self.offset;
            while self
                .peek()
                .is_some_and(|character| character.is_ascii_hexdigit())
            {
                self.advance();
            }

            let hex = self.text.get(digits..self.offset).ok_or("syntax")?;
            return u64::from_str_radix(hex, HEX_RADIX)
                .map(|value| value as f64)
                .map_err(|_| "syntax");
        }

        while self
            .peek()
            .is_some_and(|character| character.is_ascii_digit())
        {
            self.advance();
        }

        if self.peek() == Some('.')
            && self
                .peek_at(1)
                .is_some_and(|character| character.is_ascii_digit())
        {
            self.advance();
            while self
                .peek()
                .is_some_and(|character| character.is_ascii_digit())
            {
                self.advance();
            }
        }

        if matches!(self.peek(), Some('e' | 'E')) {
            self.advance();
            if matches!(self.peek(), Some('+' | '-')) {
                self.advance();
            }
            while self
                .peek()
                .is_some_and(|character| character.is_ascii_digit())
            {
                self.advance();
            }
        }

        let token = self.text.get(start..self.offset).ok_or("syntax")?;
        token
            .parse::<f64>()
            .map_err(|_| "syntax")
            .and_then(|value| {
                if value.is_finite() {
                    Ok(value)
                } else {
                    Err("syntax")
                }
            })
    }

    fn next(&mut self) -> Result<Option<(Token, Range<usize>)>, &'static str> {
        self.skip_trivia()?;
        let start = self.offset;
        let Some(character) = self.peek() else {
            return Ok(None);
        };

        let token = if character == '"' {
            self.advance();
            Token::Text(self.text_literal()?)
        } else if character == '#' && self.peek_at(1) == Some('"') {
            self.offset += 2;
            Token::Identifier(self.text_literal()?)
        } else if character == '#' || is_identifier_start(character) {
            self.advance();
            // Regular identifiers may contain dots between parts, as in `Table.SelectRows`.
            loop {
                match (self.peek(), self.peek_at(1)) {
                    (Some(part), _) if is_identifier_part(part) => {
                        self.advance();
                    }
                    (Some('.'), Some(next)) if is_identifier_start(next) => {
                        self.advance();
                    }
                    _ => break,
                }
            }

            Token::Identifier(
                self.text
                    .get(start..self.offset)
                    .ok_or("syntax")?
                    .to_owned(),
            )
        } else if character.is_ascii_digit()
            || (character == '.' && self.peek_at(1).is_some_and(|next| next.is_ascii_digit()))
        {
            Token::Number(self.number()?)
        } else {
            const SYMBOLS: [&str; 20] = [
                "<>", "<=", ">=", "=>", "..", "=", "<", ">", "(", ")", "{", "}", "[", "]", ",",
                ";", "&", "+", "-", "*",
            ];
            let rest = self.text.get(self.offset..).ok_or("syntax")?;
            let symbol = SYMBOLS
                .iter()
                .find(|symbol| rest.starts_with(**symbol))
                .copied()
                .or_else(|| rest.starts_with('/').then_some("/"))
                .ok_or("syntax")?;
            self.offset += symbol.len();
            Token::Symbol(symbol)
        };

        Ok(Some((token, start..self.offset)))
    }
}

fn tokenize(text: &str) -> Result<Vec<(Token, Range<usize>)>, &'static str> {
    let mut lexer = Lexer { text, offset: 0 };
    let mut tokens = Vec::new();

    while let Some(token) = lexer.next()? {
        if tokens.len() >= MAX_TOKENS {
            return Err("limit");
        }

        tokens.push(token);
    }

    Ok(tokens)
}

struct Parser<'a> {
    text: &'a str,
    tokens: &'a [(Token, Range<usize>)],
    position: usize,
    depth: usize,
}

impl Parser<'_> {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.position).map(|entry| &entry.0)
    }

    fn peek_at(&self, ahead: usize) -> Option<&Token> {
        self.tokens.get(self.position + ahead).map(|entry| &entry.0)
    }

    fn is_symbol(&self, symbol: &str) -> bool {
        matches!(self.peek(), Some(Token::Symbol(found)) if *found == symbol)
    }

    fn is_keyword(&self, keyword: &str) -> bool {
        matches!(self.peek(), Some(Token::Identifier(found)) if found == keyword)
    }

    fn expect(&mut self, symbol: &str) -> Result<(), &'static str> {
        if self.is_symbol(symbol) {
            self.position += 1;
            Ok(())
        } else {
            Err("syntax")
        }
    }

    fn keyword(&mut self, keyword: &str) -> Result<(), &'static str> {
        if self.is_keyword(keyword) {
            self.position += 1;
            Ok(())
        } else {
            Err("syntax")
        }
    }

    fn enter(&mut self) -> Result<(), &'static str> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            Err("limit")
        } else {
            Ok(())
        }
    }

    fn identifier(&mut self) -> Result<String, &'static str> {
        match self.peek() {
            Some(Token::Identifier(name)) => {
                let name = name.clone();
                self.position += 1;
                Ok(name)
            }
            _ => Err("syntax"),
        }
    }

    /// A generalized identifier: the source text up to `]`, `=` or `,`, with
    /// blanks between parts kept, as in `[First Name]`.
    fn generalized(&mut self) -> Result<String, &'static str> {
        if let (Some(Token::Identifier(name)), Some(Token::Symbol("]" | "=" | ","))) =
            (self.peek(), self.peek_at(1))
        {
            let name = name.clone();
            self.position += 1;
            return Ok(name);
        }

        let start = self.tokens.get(self.position).ok_or("syntax")?.1.start;
        let mut end = start;
        while let Some((token, span)) = self.tokens.get(self.position) {
            if matches!(token, Token::Symbol("]" | "=" | ",")) {
                break;
            }

            if !matches!(token, Token::Identifier(_) | Token::Number(_)) {
                return Err("syntax");
            }

            end = span.end;
            self.position += 1;
        }

        let name = self.text.get(start..end).ok_or("syntax")?.trim();
        if name.is_empty() {
            return Err("syntax");
        }

        Ok(name.to_owned())
    }

    fn expression(&mut self) -> Result<Expr, &'static str> {
        self.enter()?;
        let result = if self.is_keyword("let") {
            self.let_expression()
        } else if self.is_keyword("each") {
            self.position += 1;
            self.expression().map(|body| Expr::Each(Box::new(body)))
        } else if self.is_keyword("error") {
            self.position += 1;
            self.expression().map(|body| Expr::Error(Box::new(body)))
        } else {
            self.binary(0)
        };
        self.depth -= 1;
        result
    }

    fn let_expression(&mut self) -> Result<Expr, &'static str> {
        self.keyword("let")?;
        let mut bindings = Vec::new();

        loop {
            let name = self.identifier()?;
            self.expect("=")?;
            bindings.push((name, self.expression()?));

            if self.is_symbol(",") {
                self.position += 1;
                continue;
            }

            break;
        }

        self.keyword("in")?;
        let body = self.expression()?;
        Ok(Expr::Let(bindings, Box::new(body)))
    }

    /// Binary operators by M precedence, lowest first.
    fn binary(&mut self, level: usize) -> Result<Expr, &'static str> {
        const LEVELS: [&[&str]; 6] = [
            &["or"],
            &["and"],
            &["=", "<>"],
            &["<", "<=", ">", ">="],
            &["+", "-", "&"],
            &["*", "/"],
        ];

        let Some(operators) = LEVELS.get(level) else {
            return self.unary();
        };

        let mut left = self.binary(level + 1)?;
        loop {
            let operator = match self.peek() {
                Some(Token::Symbol(symbol)) => {
                    operators.iter().find(|candidate| **candidate == *symbol)
                }
                Some(Token::Identifier(word)) => {
                    operators.iter().find(|candidate| **candidate == word)
                }
                _ => None,
            };
            let Some(operator) = operator.copied() else {
                return Ok(left);
            };

            self.position += 1;
            self.enter()?;
            let right = self.binary(level + 1);
            self.depth -= 1;
            left = Expr::Binary(operator, Box::new(left), Box::new(right?));
        }
    }

    fn unary(&mut self) -> Result<Expr, &'static str> {
        if self.is_keyword("not") {
            self.position += 1;
            self.enter()?;
            let operand = self.unary();
            self.depth -= 1;
            return operand.map(|operand| Expr::Not(Box::new(operand)));
        }

        if self.is_symbol("-") {
            self.position += 1;
            self.enter()?;
            let operand = self.unary();
            self.depth -= 1;
            return operand.map(|operand| Expr::Negate(Box::new(operand)));
        }

        self.postfix()
    }

    fn postfix(&mut self) -> Result<Expr, &'static str> {
        let mut expression = self.primary()?;

        loop {
            if self.is_symbol("(") {
                self.position += 1;
                let arguments = self.sequence(")")?;
                expression = Expr::Call(Box::new(expression), arguments);
            } else if self.is_symbol("{") {
                self.position += 1;
                let selector = self.expression()?;
                self.expect("}")?;
                expression = Expr::Item(Box::new(expression), Box::new(selector));
            } else if self.is_symbol("[") {
                self.position += 1;
                let name = self.generalized()?;
                self.expect("]")?;
                expression = Expr::Field(Some(Box::new(expression)), name);
            } else {
                return Ok(expression);
            }
        }
    }

    fn sequence(&mut self, close: &str) -> Result<Vec<Expr>, &'static str> {
        let mut items = Vec::new();
        if self.is_symbol(close) {
            self.position += 1;
            return Ok(items);
        }

        loop {
            items.push(self.expression()?);
            if self.is_symbol(",") {
                self.position += 1;
                continue;
            }

            self.expect(close)?;
            return Ok(items);
        }
    }

    /// `[` starts a record when a field name is followed by `=`, else a field access.
    fn bracket(&mut self) -> Result<Expr, &'static str> {
        let start = self.position;
        if self.is_symbol("]") {
            self.position += 1;
            return Ok(Expr::Record(Vec::new()));
        }

        let name = self.generalized()?;
        if self.is_symbol("]") {
            self.position += 1;
            return Ok(Expr::Field(None, name));
        }

        self.position = start;
        let mut fields = Vec::new();
        loop {
            let name = self.generalized()?;
            self.expect("=")?;
            fields.push((name, self.expression()?));

            if self.is_symbol(",") {
                self.position += 1;
                continue;
            }

            self.expect("]")?;
            return Ok(Expr::Record(fields));
        }
    }

    fn primary(&mut self) -> Result<Expr, &'static str> {
        let token = self.peek().cloned().ok_or("syntax")?;
        self.position += 1;

        match token {
            Token::Number(value) => Ok(Expr::Number(value)),
            Token::Text(value) => Ok(Expr::Text(value)),
            Token::Identifier(name) => match name.as_str() {
                "null" => Ok(Expr::Null),
                "true" => Ok(Expr::Logical(true)),
                "false" => Ok(Expr::Logical(false)),
                "type" => self.type_value(),
                // Keywords outside the subset make the member unsupported.
                "if" | "try" | "meta" | "section" | "shared" | "otherwise" | "then" | "else"
                | "as" | "is" | "in" | "let" | "each" | "error" | "not" | "and" | "or" => {
                    Err("syntax")
                }
                _ if name.starts_with('#') => Err("syntax"),
                _ => Ok(Expr::Identifier(name)),
            },
            Token::Symbol("(") => {
                self.enter()?;
                let inner = self.expression();
                self.depth -= 1;
                let inner = inner?;
                self.expect(")")?;
                Ok(inner)
            }
            Token::Symbol("{") => {
                self.enter()?;
                let items = self.sequence("}");
                self.depth -= 1;
                items.map(Expr::List)
            }
            Token::Symbol("[") => {
                self.enter()?;
                let bracket = self.bracket();
                self.depth -= 1;
                bracket
            }
            Token::Symbol(_) => Err("syntax"),
        }
    }

    fn type_value(&mut self) -> Result<Expr, &'static str> {
        let nullable = self.is_keyword("nullable");
        if nullable {
            self.position += 1;
        }

        let name = self.identifier()?;
        Ok(Expr::Type(name))
    }
}

/// Parses `section Section1;` and its members. A member whose expression is
/// outside the subset keeps its text span and a reason; a malformed section
/// header fails the whole document.
pub(crate) fn parse_section(text: &str) -> Result<Vec<Member>, &'static str> {
    let tokens = tokenize(text)?;
    let mut parser = Parser {
        text,
        tokens: &tokens,
        position: 0,
        depth: 0,
    };

    parser.keyword("section")?;
    if parser.identifier()? != "Section1" {
        return Err("section");
    }
    parser.expect(";")?;

    let mut members = Vec::new();
    while parser.peek().is_some() {
        let start = tokens.get(parser.position).ok_or("syntax")?.1.start;
        if parser.is_keyword("shared") {
            parser.position += 1;
        }

        let name = parser.identifier()?;
        parser.expect("=")?;

        // A member that does not parse is skipped to its terminating `;` at depth zero.
        let body_start = parser.position;
        let body = parser.expression().and_then(|body| {
            if parser.is_symbol(";") {
                Ok(body)
            } else {
                Err("syntax")
            }
        });
        if body.is_err() {
            parser.position = body_start;
            parser.depth = 0;
            let mut nesting = 0usize;
            while let Some(token) = parser.peek() {
                match token {
                    Token::Symbol("(" | "[" | "{") => nesting += 1,
                    Token::Symbol(")" | "]" | "}") => nesting = nesting.saturating_sub(1),
                    Token::Symbol(";") if nesting == 0 => break,
                    _ => {}
                }
                parser.position += 1;
            }
        }

        let end = tokens.get(parser.position).ok_or("syntax")?.1.end;
        parser.expect(";")?;
        members.push(Member {
            name,
            body,
            span: start..end,
        });
    }

    Ok(members)
}
