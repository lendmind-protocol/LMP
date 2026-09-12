pub fn too_complex(value: bool) {
    if value { for _ in 0..2 { if value { while value { break; } } } }
}
