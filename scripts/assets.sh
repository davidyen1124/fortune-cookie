#!/bin/sh
# Compress the Blender bakes and the imagegen scans into the web assets.
# The crust atlas ships at two sizes: 4k for desktops, 2k for phones.
set -e
cd "$(dirname "$0")/.."
B=blender/baked
A=public/assets
# colour at 4k for desktops and 2k for phones; the pore normals and AO/roughness are fine at 2k
cwebp -quiet -q 86 -m 6 -sharp_yuv $B/crust_color.png -o $A/crust_color_4k.webp
cwebp -quiet -q 86 -m 6 -sharp_yuv -resize 2048 1024 $B/crust_color.png -o $A/crust_color_2k.webp
cwebp -quiet -q 90 -m 6 -resize 2048 1024 $B/crust_normal.png -o $A/crust_normal.webp
cwebp -quiet -q 88 -m 6 -resize 2048 1024 $B/crust_orm.png -o $A/crust_orm.webp
rm -f $A/crust_normal_*.webp $A/crust_orm_*.webp
# geometry: quantise + meshopt-compress the glTF (three's GLTFLoader decodes it)
npx --yes @gltf-transform/cli meshopt $A/cookie.glb $A/cookie.glb --level medium > /dev/null
# the porous cross-section band of the broken-edge scan
cwebp -quiet -q 88 -crop 0 424 1024 176 art/imagegen/cookie_broken_edge.png -o $A/crumb.webp
cwebp -quiet -q 86 -resize 768 768 art/imagegen/paper_fiber.png -o $A/paper_fiber.webp
ls -la $A
