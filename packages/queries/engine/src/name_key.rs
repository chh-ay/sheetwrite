//! Names compared as core compares them: each name in Unicode normalization form C (NFC), then
//! letter case ignored in every alphabet. Table headers compare in upper case, as core's
//! `formulaNameKey` does, and query names in lower case, as core's saved-query check does.

use std::borrow::Cow;

/// `name` in NFC. ASCII text is already in that form, so a plain name never leaves the engine.
pub(crate) fn nfc(name: &str) -> Cow<'_, str> {
    if name.is_ascii() {
        Cow::Borrowed(name)
    } else {
        Cow::Owned(host::normalized(name))
    }
}

/// Whether two NFC names are equal once every character is upper-cased. Compares the
/// characters without building upper-case copies.
pub(crate) fn same_upper(left: &str, right: &str) -> bool {
    left.chars()
        .flat_map(char::to_uppercase)
        .eq(right.chars().flat_map(char::to_uppercase))
}

/// Whether two NFC names are equal once every character is lower-cased. Compares the
/// characters without building lower-case copies.
pub(crate) fn same_lower(left: &str, right: &str) -> bool {
    left.chars()
        .flat_map(char::to_lowercase)
        .eq(right.chars().flat_map(char::to_lowercase))
}

/// The engine runs in JavaScript, whose `String.prototype.normalize` holds the Unicode tables,
/// so the WebAssembly module carries none.
#[cfg(target_arch = "wasm32")]
mod host {
    use wasm_bindgen::prelude::{wasm_bindgen, JsValue};
    use wasm_bindgen::JsCast;

    #[wasm_bindgen]
    extern "C" {
        /// A JavaScript string, for its `normalize` method.
        type JsText;

        #[wasm_bindgen(method, js_name = normalize)]
        fn normalize(this: &JsText, form: &str) -> String;
    }

    /// `name` in NFC, from the host.
    #[cold]
    #[inline(never)]
    pub(super) fn normalized(name: &str) -> String {
        JsValue::from_str(name)
            .unchecked_into::<JsText>()
            .normalize("NFC")
    }
}

/// Native builds run only the tests, so they take the Unicode tables from a crate that the
/// WebAssembly build does not link.
#[cfg(not(target_arch = "wasm32"))]
mod host {
    use unicode_normalization::UnicodeNormalization;

    /// `name` in NFC.
    pub(super) fn normalized(name: &str) -> String {
        name.nfc().collect()
    }
}
