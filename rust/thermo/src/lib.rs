mod abi;
mod activity;
mod caloric;
mod column_numerics;
mod mesh;
mod properties;
mod sparse;

pub fn execute(input: &str) -> String {
    let result = (|| -> Result<serde_json::Value, String> {
        let mut value: serde_json::Value =
            serde_json::from_str(input).map_err(|e| e.to_string())?;
        let column = value.as_object_mut().and_then(|v| v.remove("column"));
        let request = serde_json::from_value(value).map_err(|e| e.to_string())?;
        if let Some(column) = column {
            properties::column(request, column)
        } else {
            serde_json::to_value(properties::evaluate(request)?).map_err(|e| e.to_string())
        }
    })();
    match result {
        Ok(value) => serde_json::json!({"ok": true, "result": value}).to_string(),
        Err(error) => serde_json::json!({"ok": false, "error": error}).to_string(),
    }
}
