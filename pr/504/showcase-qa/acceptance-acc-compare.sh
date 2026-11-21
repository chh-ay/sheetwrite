#!/usr/bin/env bash
# acc-compare.sh: compare the recaptured card shots with the committed ones, by bytes and by decoded pixels.
cd /home/vvin/checkouts/dsq-acc
T=/home/vvin/learn/scratch/dsq/acc/cmp; rm -rf $T; mkdir -p $T
for name in sort queries version-history; do for theme in light dark; do for s in 1 2; do
  f=docs/public/figures/shots/$name-$theme-${s}x.avif
  git show HEAD:$f > $T/old.avif 2>/dev/null || { echo "$f: not committed"; continue; }
  cmp -s $T/old.avif $f && bytes=identical || bytes="differ ($(stat -c%s $T/old.avif) → $(stat -c%s $f) B)"
  avifdec $T/old.avif $T/old.png >/dev/null 2>&1; avifdec $f $T/new.png >/dev/null 2>&1
  dims="$(magick identify -format '%wx%h' $T/old.png) vs $(magick identify -format '%wx%h' $T/new.png)"
  ae=$(magick compare -metric AE $T/old.png $T/new.png null: 2>&1 | cut -d' ' -f1)
  psnr=$(magick compare -metric PSNR $T/old.png $T/new.png null: 2>&1 | cut -d' ' -f1)
  [ "$ae" != "0" ] && magick compare $T/old.png $T/new.png $T/diff-$name-$theme-${s}x.png 2>/dev/null
  echo "$name-$theme-${s}x: bytes $bytes; size $dims; differing pixels $ae; PSNR $psnr dB"
done; done; done
