#!/bin/sh
# Compress the scan's photo texture, the imagegen scans and the meshes into the web assets.
set -e
cd "$(dirname "$0")/.."
B=blender/baked
A=public/assets
cwebp -quiet -q 92 -m 6 -sharp_yuv $B/scan_color.png -o $A/crust_color.webp
rm -f $A/crust_color_*.webp $A/crust_normal.webp $A/crust_orm.webp
# the porous cross-section band of the broken-edge scan
cwebp -quiet -q 88 -crop 0 424 1024 176 art/imagegen/cookie_broken_edge.png -o $A/crumb.webp
cwebp -quiet -q 86 -resize 768 768 art/imagegen/paper_fiber.png -o $A/paper_fiber.webp
# geometry: quantise + meshopt-compress the glTF (three's GLTFLoader decodes it)
npx --yes @gltf-transform/cli meshopt $A/cookie.glb $A/cookie.glb --level medium > /dev/null
ls -la $A
