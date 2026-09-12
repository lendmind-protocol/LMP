pub fn bounded(value: bool) -> Result<(), &'static str> {
    if value { Ok(()) } else { Err("rejected") }
}
