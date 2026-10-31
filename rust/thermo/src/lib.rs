mod abi;
mod activity;
mod caloric;
mod properties;

pub fn execute(input: &str) -> String {
    let result = serde_json::from_str(input)
        .map_err(|e| e.to_string())
        .and_then(properties::evaluate);
    match result {
        Ok(value) => serde_json::json!({"ok": true, "result": value}).to_string(),
        Err(error) => serde_json::json!({"ok": false, "error": error}).to_string(),
    }
}
