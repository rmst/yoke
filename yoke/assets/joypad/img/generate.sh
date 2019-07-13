#!/bin/bash

seq 2 16 | xargs -I xx cp 1.svg xx.svg
seq 2 16 | xargs -I xx sed -i -E "s/1<\/text>/xx<\/text>/g" xx.svg

# ←↓→↑ can be entered on Linux "latin" keyboards (e.g. Polish)
# using RAlt+Y, RAlt+U, RAlt+I, RAlt+Shift+U, respectively
printf "du\ndl\ndd\ndr" | xargs -I xx cp 1.svg xx.svg
sed -i -E "s/1<\/text>/↑<\/text>/g" du.svg
sed -i -E "s/1<\/text>/←<\/text>/g" dl.svg
sed -i -E "s/1<\/text>/→<\/text>/g" dr.svg
sed -i -E "s/1<\/text>/↓<\/text>/g" dd.svg
