// Explicitly owned byte-copy ABI; no shared-memory views survive an operation.
#[no_mangle]
pub extern "C" fn thermo_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}
#[no_mangle]
/// # Safety
/// `ptr,len` must describe a live allocation returned by this module.
pub unsafe extern "C" fn thermo_free(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}
#[no_mangle]
/// # Safety
/// `ptr,len` must describe readable UTF-8 bytes in this module's memory.
pub unsafe extern "C" fn thermo_execute(ptr: *const u8, len: usize) -> u64 {
    let bytes = std::slice::from_raw_parts(ptr, len);
    let result = match std::str::from_utf8(bytes) {
        Ok(s) => crate::execute(s),
        Err(_) => "{\"ok\":false,\"error\":\"Invalid UTF-8\"}".into(),
    };
    let data = result.into_bytes().into_boxed_slice();
    let len = data.len();
    let ptr = Box::into_raw(data) as *mut u8;
    ((ptr as u64) << 32) | (len as u64)
}
