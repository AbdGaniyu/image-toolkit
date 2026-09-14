"""Image operations, one module each.

Every operation is a pure function `(PIL.Image, params) -> PIL.Image`. Inputs
are always RGB or RGBA with orientation already applied (codec.decode
guarantees it); metadata is handled by codec, never here.
"""
