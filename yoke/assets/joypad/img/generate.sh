#!/bin/bash

seq 2 16 | xargs -I xx cp a1.svg axx.svg
seq 2 16 | xargs -I xx sed -i -E "s/1<\/text>/xx<\/text>/g" axx.svg
seq 1 16 | xargs -I xx cp axx.svg bxx.svg
seq 1 16 | xargs -I xx sed -i 's/stroke-dasharray="210 35" //g' bxx.svg
seq 1 16 | xargs -I xx sed -i 's/stroke="rgba(255, 255, 255, 0.2)"/stroke="rgba(255, 255, 255, 0.5)"/g' bxx.svg

# ←↓→↑ can be entered on Linux "latin" keyboards (e.g. Polish)
# using RAlt+Y, RAlt+U, RAlt+I, RAlt+Shift+U, respectively.
# The encircled arrows have been incorporated into dp.svg.

# This code will generate the select, start and branded buttons:
printf "bg\nbm\nbs" | xargs -I xx cp b1.svg xx.svg
sed -i -E "s/1<\/text>/G<\/text>/g" bg.svg
sed -i -E "s/1<\/text>/M<\/text>/g" bm.svg
sed -i -E "s/1<\/text>/▶<\/text>/g" bs.svg
