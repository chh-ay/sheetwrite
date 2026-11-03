//! Restricted design-study compiler. Other formulas keep the tree evaluator.

use std::mem::MaybeUninit;

use crate::calc::{Ast, CmpOp, Func, Op};
use crate::memory::MemoryOwnerStats;
use crate::store::CellStore;
use crate::types::{CellRange, FormulaError, Value, FORMULA_RECURSION_LIMIT};
use super::{operators, value, EvalPass};

const STACK_LIMIT: usize = 32;

#[derive(Clone, Debug)]
enum Instruction {
    Constant(Value),
    Cell { sheet: Option<u32>, row: u32, col: u32, depth: usize },
    RangeSum { range: CellRange, local: bool, depth: usize },
    Neg,
    Pos,
    Percent,
    CheckNumber,
    Binary(Op),
    Compare(CmpOp),
    Sum(bool),
    Branch(usize),
    Jump(usize),
}

#[derive(Clone, Debug)]
pub(crate) struct Program {
    instructions: Box<[Instruction]>,
    maximum_depth: usize,
}

struct Compiler {
    instructions: Vec<Instruction>,
    live: usize,
    maximum_depth: usize,
}

impl Compiler {
    fn push(&mut self, instruction: Instruction) -> Option<()> {
        self.live += 1;
        if self.live > STACK_LIMIT { return None; }
        self.instructions.push(instruction);
        Some(())
    }

    fn node(&mut self, ast: &Ast, depth: usize) -> Option<()> {
        self.maximum_depth = self.maximum_depth.max(depth);
        match ast {
            Ast::Num(number) => self.push(Instruction::Constant(Value::number(*number)))?,
            Ast::Str(text) => self.push(Instruction::Constant(Value::text(text.as_str())))?,
            Ast::Bool(boolean) => self.push(Instruction::Constant(Value::Bool(*boolean)))?,
            Ast::Missing => self.push(Instruction::Constant(Value::Blank))?,
            Ast::Cell(row, col, _) => self.push(Instruction::Cell { sheet: None, row: *row, col: *col, depth })?,
            Ast::AbsCell(sheet, row, col, _) => self.push(Instruction::Cell { sheet: Some(sheet.handle), row: *row, col: *col, depth })?,
            Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
                self.node(inner, depth + 1)?;
                self.instructions.push(match ast {
                    Ast::Neg(_) => Instruction::Neg,
                    Ast::Pos(_) => Instruction::Pos,
                    _ => Instruction::Percent,
                });
            }
            Ast::Bin(op, left, right) if *op != Op::Concat => {
                self.node(left, depth + 1)?;
                self.instructions.push(Instruction::CheckNumber);
                self.node(right, depth + 1)?;
                self.instructions.push(Instruction::Binary(*op));
                self.live -= 1;
            }
            Ast::Cmp(op, left, right) => {
                self.node(left, depth + 1)?;
                self.node(right, depth + 1)?;
                self.instructions.push(Instruction::Compare(*op));
                self.live -= 1;
            }
            Ast::Func(Func::If, args) if (2..=3).contains(&args.len()) => {
                self.node(&args[0], depth + 2)?;
                let branch = self.instructions.len();
                self.instructions.push(Instruction::Branch(0));
                self.live -= 1;
                let saved_live = self.live;
                self.node(&args[1], depth + 2)?;
                let jump = self.instructions.len();
                self.instructions.push(Instruction::Jump(0));
                self.instructions[branch] = Instruction::Branch(self.instructions.len());
                self.live = saved_live;
                if let Some(otherwise) = args.get(2) {
                    self.node(otherwise, depth + 2)?;
                } else {
                    self.push(Instruction::Constant(Value::Number(0.0)))?;
                }
                self.instructions[jump] = Instruction::Jump(self.instructions.len());
            }
            Ast::Func(Func::Sum, args) => {
                self.push(Instruction::Constant(Value::Number(0.0)))?;
                for arg in args {
                    let range = match arg {
                        Ast::Range(first_row, first_col, last_row, last_col, _) => Some((CellRange::new(0, *first_row, *first_col, *last_row, *last_col), true)),
                        Ast::AbsRange(sheet, first_row, first_col, last_row, last_col, _) => Some((CellRange::new(sheet.handle, *first_row, *first_col, *last_row, *last_col), false)),
                        _ => None,
                    };
                    if let Some((range, local)) = range {
                        self.maximum_depth = self.maximum_depth.max(depth + 2);
                        self.push(Instruction::RangeSum { range, local, depth: depth + 2 })?;
                    } else {
                        self.node(arg, depth + 2)?;
                    }
                    self.instructions.push(Instruction::Sum(matches!(arg, Ast::Cell(..) | Ast::AbsCell(..))));
                    self.live -= 1;
                }
            }
            _ => return None,
        }
        Some(())
    }
}

impl Program {
    pub(crate) fn compile(ast: &Ast) -> Option<Box<Self>> {
        let mut compiler = Compiler { instructions: Vec::new(), live: 0, maximum_depth: 0 };
        compiler.node(ast, 0)?;
        Some(Box::new(Self { instructions: compiler.instructions.into_boxed_slice(), maximum_depth: compiler.maximum_depth }))
    }

    pub(crate) fn fits_depth(&self, depth: usize) -> bool {
        depth.saturating_add(self.maximum_depth) < FORMULA_RECURSION_LIMIT
    }

    pub(crate) fn heap_memory_stats(&self, out: &mut MemoryOwnerStats) {
        let bytes = std::mem::size_of::<Self>() + std::mem::size_of_val(&*self.instructions);
        out.add_payload(bytes, bytes);
        for instruction in &self.instructions {
            if let Instruction::Constant(Value::Text(text)) = instruction {
                out.add_payload(text.len(), text.len());
            }
        }
    }
}

struct Stack {
    values: [MaybeUninit<Value>; STACK_LIMIT],
    live: usize,
}

impl Stack {
    fn new() -> Self { Self { values: std::array::from_fn(|_| MaybeUninit::uninit()), live: 0 } }
    fn push(&mut self, value: Value) {
        self.values[self.live].write(value);
        self.live += 1;
    }
    fn pop(&mut self) -> Value {
        self.live -= 1;
        // SAFETY: the compiler emits balanced stack operations, and only the
        // live prefix is initialized. Popping transfers ownership to the caller.
        unsafe { self.values[self.live].assume_init_read() }
    }
}

impl Drop for Stack {
    fn drop(&mut self) {
        for value in &mut self.values[..self.live] {
            // SAFETY: every slot in the live prefix owns one initialized value.
            unsafe { value.assume_init_drop(); }
        }
    }
}

impl CellStore {
    #[inline(never)]
    pub(super) fn eval_bytecode_family(&self, program: &Program, sheet: usize, pass: &mut EvalPass<'_>, depth: usize) -> Value {
        let mut stack = Stack::new();
        let mut cursor = 0;
        while let Some(instruction) = program.instructions.get(cursor) {
            cursor += 1;
            match instruction {
                Instruction::Constant(value) => stack.push(value.clone()),
                Instruction::Cell { sheet: target, row, col, depth: relative } => stack.push(self.eval_at(target.map_or(sheet, |target| target as usize), *row as usize, *col as usize, pass, depth + relative + 1)),
                Instruction::RangeSum { range, local, depth: relative } => {
                    let mut range = *range;
                    if *local { range.sheet = sheet as u32; }
                    stack.push(self.eval_sum_range(range, pass, depth + relative));
                }
                Instruction::Neg | Instruction::Pos | Instruction::Percent => {
                    let operand = stack.pop();
                    let op = match instruction {
                        Instruction::Neg => operators::UnaryOp::Neg,
                        Instruction::Pos => operators::UnaryOp::Pos,
                        _ => operators::UnaryOp::Percent,
                    };
                    stack.push(operators::unary(op, &operand));
                }
                Instruction::CheckNumber => {
                    let operand = stack.pop();
                    match value::number_from_value(&operand) {
                        Ok(_) => stack.push(operand),
                        Err(error) => return Value::Error(error),
                    }
                }
                Instruction::Binary(op) => {
                    let right = stack.pop();
                    let left = stack.pop();
                    stack.push(operators::binary(*op, &left, || right));
                }
                Instruction::Compare(op) => {
                    let right = stack.pop();
                    let left = stack.pop();
                    stack.push(operators::comparison(*op, &left, &right));
                }
                Instruction::Sum(from_reference) => {
                    let operand = stack.pop();
                    let accumulator = stack.pop();
                    let number = match value::aggregate_number(&operand, *from_reference) {
                        Ok(number) => number.unwrap_or(0.0),
                        Err(error) => return Value::Error(error),
                    };
                    let Value::Number(total) = accumulator else { return Value::Error(FormulaError::Value); };
                    stack.push(Value::number(total + number));
                }
                Instruction::Branch(otherwise) => {
                    match value::bool_from_value(&stack.pop()) {
                        Ok(false) => cursor = *otherwise,
                        Ok(true) => {},
                        Err(error) => return Value::Error(error),
                    }
                }
                Instruction::Jump(end) => cursor = *end,
            }
        }
        stack.pop()
    }
}
