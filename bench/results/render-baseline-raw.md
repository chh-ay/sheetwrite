# Auditable render benchmark

Protocol version: **1**  
Run ID: `6399324d-e5da-446c-a678-1cb793615441`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `49e05e298c3f39a8cede038fe8d0062343abc21f` (clean) |
| Timestamp | 2026-10-17T08:17:04.490Z |
| Runtime | Bun 1.4.3; Node 26.3.0 |
| Browser | 153.0.8010.12 |
| OS / arch | linux 7.2.8-1-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.4.0; Handsontable 18.1.2 |
| Dataset | seed 1592639710; 100,000 rows = `fnv1a32:178eac66` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: handsontable → sheetwrite; round 2: sheetwrite → handsontable; round 3: handsontable → sheetwrite; round 4: sheetwrite → handsontable; round 5: handsontable → sheetwrite; round 6: sheetwrite → handsontable; round 7: handsontable → sheetwrite; round 8: sheetwrite → handsontable; round 9: handsontable → sheetwrite; round 10: sheetwrite → handsontable |
| Browser launches | 20 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 100,000 | [`r1-100000-scroll-down.top-left`](./render-results.json) | median 1.165 ms; p95 1.380; MAD 0.09916; 3 samples / 252 ops | median 14.137 ms; p95 14.412; MAD 0.12500; 3 samples / 23 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.middle`](./render-results.json) | median 1.096 ms; p95 1.125; MAD 0.03244; 3 samples / 276 ops | median 3.846 ms; p95 3.848; MAD 0.00199; 3 samples / 81 ops |
| 1 | 100,000 | [`r1-100000-scroll-smooth.same-window`](./render-results.json) | median 0.38911 ms; p95 0.38981; MAD 0.00078; 3 samples / 772 ops | median 7.371 ms; p95 7.378; MAD 0.00000; 3 samples / 42 ops |
| 1 | 100,000 | [`r1-100000-scroll-right.top-left`](./render-results.json) | median 0.25368 ms; p95 0.30031; MAD 0.02357; 3 samples / 1184 ops | median 10.320 ms; p95 10.329; MAD 0.01000; 3 samples / 30 ops |
| 1 | 100,000 | [`r1-100000-edit-open.top-left`](./render-results.json) | median 0.43860 ms; p95 0.47951; MAD 0.00148; 3 samples / 664 ops | median 0.93056 ms; p95 0.93670; MAD 0.00683; 3 samples / 325 ops |
| 1 | 100,000 | [`r1-100000-edit-open.middle`](./render-results.json) | median 0.48878 ms; p95 0.50204; MAD 0.00233; 3 samples / 618 ops | median 0.98529 ms; p95 0.99764; MAD 0.01372; 3 samples / 308 ops |
| 1 | 100,000 | [`r1-100000-edit-open.bottom-right`](./render-results.json) | median 0.40691 ms; p95 0.43543; MAD 0.02554; 3 samples / 737 ops | median 1.452 ms; p95 1.563; MAD 0.01932; 3 samples / 203 ops |
| 1 | 100,000 | [`r1-100000-edit-commit.middle`](./render-results.json) | median 0.74627 ms; p95 0.75538; MAD 0.01012; 3 samples / 418 ops | median 4.623 ms; p95 5.030; MAD 0.02727; 3 samples / 64 ops |
| 1 | 100,000 | [`r1-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.700 ms; p95 1.826; MAD 0.03000; 3 samples / 174 ops | median 14.088 ms; p95 15.564; MAD 0.97500; 3 samples / 23 ops |
| 1 | 100,000 | [`r1-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.443 ms; p95 1.489; MAD 0.00286; 3 samples / 207 ops | median 11.367 ms; p95 12.488; MAD 0.05556; 3 samples / 26 ops |
| 1 | 100,000 | [`r1-100000-arrow-down.top-left`](./render-results.json) | median 0.56723 ms; p95 0.58613; MAD 0.02100; 3 samples / 544 ops | median 1.305 ms; p95 1.358; MAD 0.01161; 3 samples / 229 ops |
| 1 | 100,000 | [`r1-100000-arrow-right.middle`](./render-results.json) | median 0.56292 ms; p95 0.63752; MAD 0.03101; 3 samples / 521 ops | median 1.217 ms; p95 1.219; MAD 0.00264; 3 samples / 249 ops |
| 1 | 100,000 | [`r1-100000-formatted-paint.top-left`](./render-results.json) | median 0.36400 ms; p95 0.43114; MAD 0.01029; 3 samples / 786 ops | median 3.252 ms; p95 3.284; MAD 0.03548; 3 samples / 94 ops |
| 1 | 100,000 | [`r1-100000-merge-heavy.paint`](./render-results.json) | median 0.00324 ms; p95 0.00338; MAD 0.00004; 3 samples / 91537 ops | median 3.778 ms; p95 3.814; MAD 0.01852; 3 samples / 81 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.top-left`](./render-results.json) | median 1.140 ms; p95 1.334; MAD 0.00045; 3 samples / 251 ops | median 14.225 ms; p95 14.293; MAD 0.07500; 3 samples / 23 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.middle`](./render-results.json) | median 1.069 ms; p95 1.081; MAD 0.00213; 3 samples / 281 ops | median 3.744 ms; p95 3.774; MAD 0.00741; 3 samples / 81 ops |
| 2 | 100,000 | [`r2-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42766 ms; p95 0.42980; MAD 0.00238; 3 samples / 708 ops | median 7.421 ms; p95 7.428; MAD 0.00714; 3 samples / 42 ops |
| 2 | 100,000 | [`r2-100000-scroll-right.top-left`](./render-results.json) | median 0.25321 ms; p95 0.30224; MAD 0.03098; 3 samples / 1196 ops | median 10.380 ms; p95 11.048; MAD 0.08000; 3 samples / 29 ops |
| 2 | 100,000 | [`r2-100000-edit-open.top-left`](./render-results.json) | median 0.50402 ms; p95 0.64881; MAD 0.07441; 3 samples / 583 ops | median 1.038 ms; p95 1.051; MAD 0.00957; 3 samples / 290 ops |
| 2 | 100,000 | [`r2-100000-edit-open.middle`](./render-results.json) | median 0.52632 ms; p95 0.55363; MAD 0.02300; 3 samples / 581 ops | median 1.009 ms; p95 1.039; MAD 0.00500; 3 samples / 296 ops |
| 2 | 100,000 | [`r2-100000-edit-open.bottom-right`](./render-results.json) | median 0.46621 ms; p95 0.48184; MAD 0.01736; 3 samples / 698 ops | median 1.468 ms; p95 1.506; MAD 0.01014; 3 samples / 205 ops |
| 2 | 100,000 | [`r2-100000-edit-commit.middle`](./render-results.json) | median 0.75714 ms; p95 0.77218; MAD 0.01670; 3 samples / 408 ops | median 5.205 ms; p95 5.371; MAD 0.03500; 3 samples / 59 ops |
| 2 | 100,000 | [`r2-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.708 ms; p95 1.778; MAD 0.00678; 3 samples / 174 ops | median 13.412 ms; p95 15.343; MAD 0.12500; 3 samples / 23 ops |
| 2 | 100,000 | [`r2-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.366 ms; p95 1.405; MAD 0.00405; 3 samples / 219 ops | median 12.800 ms; p95 12.879; MAD 0.08750; 3 samples / 24 ops |
| 2 | 100,000 | [`r2-100000-arrow-down.top-left`](./render-results.json) | median 0.56989 ms; p95 0.60353; MAD 0.03118; 3 samples / 527 ops | median 1.500 ms; p95 2.000; MAD 0.01912; 3 samples / 184 ops |
| 2 | 100,000 | [`r2-100000-arrow-right.middle`](./render-results.json) | median 0.62893 ms; p95 0.69478; MAD 0.04754; 3 samples / 474 ops | median 1.406 ms; p95 1.485; MAD 0.04069; 3 samples / 213 ops |
| 2 | 100,000 | [`r2-100000-formatted-paint.top-left`](./render-results.json) | median 0.39605 ms; p95 0.40141; MAD 0.00365; 3 samples / 765 ops | median 3.625 ms; p95 3.628; MAD 0.00357; 3 samples / 84 ops |
| 2 | 100,000 | [`r2-100000-merge-heavy.paint`](./render-results.json) | median 0.00372 ms; p95 0.00416; MAD 0.00004; 3 samples / 77914 ops | median 3.407 ms; p95 3.622; MAD 0.11634; 3 samples / 89 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.top-left`](./render-results.json) | median 1.256 ms; p95 1.277; MAD 0.02350; 3 samples / 248 ops | median 14.175 ms; p95 14.231; MAD 0.06250; 3 samples / 24 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.middle`](./render-results.json) | median 1.098 ms; p95 1.144; MAD 0.02442; 3 samples / 273 ops | median 3.807 ms; p95 3.863; MAD 0.06182; 3 samples / 80 ops |
| 3 | 100,000 | [`r3-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39141 ms; p95 0.41296; MAD 0.00453; 3 samples / 756 ops | median 7.436 ms; p95 7.468; MAD 0.03571; 3 samples / 42 ops |
| 3 | 100,000 | [`r3-100000-scroll-right.top-left`](./render-results.json) | median 0.27832 ms; p95 0.28351; MAD 0.00482; 3 samples / 1110 ops | median 10.870 ms; p95 11.307; MAD 0.08000; 3 samples / 29 ops |
| 3 | 100,000 | [`r3-100000-edit-open.top-left`](./render-results.json) | median 0.58827 ms; p95 0.69162; MAD 0.11484; 3 samples / 557 ops | median 0.92018 ms; p95 0.92266; MAD 0.00275; 3 samples / 329 ops |
| 3 | 100,000 | [`r3-100000-edit-open.middle`](./render-results.json) | median 0.57257 ms; p95 0.57905; MAD 0.00720; 3 samples / 532 ops | median 0.99901 ms; p95 1.006; MAD 0.00799; 3 samples / 303 ops |
| 3 | 100,000 | [`r3-100000-edit-open.bottom-right`](./render-results.json) | median 0.43290 ms; p95 0.47728; MAD 0.00014; 3 samples / 671 ops | median 1.447 ms; p95 1.458; MAD 0.01228; 3 samples / 218 ops |
| 3 | 100,000 | [`r3-100000-edit-commit.middle`](./render-results.json) | median 0.72014 ms; p95 0.80445; MAD 0.02773; 3 samples / 407 ops | median 4.645 ms; p95 4.695; MAD 0.05455; 3 samples / 66 ops |
| 3 | 100,000 | [`r3-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.756 ms; p95 1.827; MAD 0.07841; 3 samples / 173 ops | median 12.862 ms; p95 14.979; MAD 0.13750; 3 samples / 23 ops |
| 3 | 100,000 | [`r3-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.415 ms; p95 1.439; MAD 0.01133; 3 samples / 213 ops | median 12.111 ms; p95 12.411; MAD 0.22222; 3 samples / 27 ops |
| 3 | 100,000 | [`r3-100000-arrow-down.top-left`](./render-results.json) | median 0.53538 ms; p95 0.55127; MAD 0.00347; 3 samples / 564 ops | median 1.449 ms; p95 1.461; MAD 0.00213; 3 samples / 208 ops |
| 3 | 100,000 | [`r3-100000-arrow-right.middle`](./render-results.json) | median 0.62422 ms; p95 0.64859; MAD 0.02243; 3 samples / 482 ops | median 1.371 ms; p95 1.375; MAD 0.00411; 3 samples / 221 ops |
| 3 | 100,000 | [`r3-100000-formatted-paint.top-left`](./render-results.json) | median 0.38876 ms; p95 0.42262; MAD 0.02136; 3 samples / 766 ops | median 3.469 ms; p95 3.651; MAD 0.20246; 3 samples / 89 ops |
| 3 | 100,000 | [`r3-100000-merge-heavy.paint`](./render-results.json) | median 0.00365 ms; p95 0.00367; MAD 0.00002; 3 samples / 84011 ops | median 3.796 ms; p95 3.803; MAD 0.00741; 3 samples / 83 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.top-left`](./render-results.json) | median 1.128 ms; p95 1.246; MAD 0.00476; 3 samples / 259 ops | median 14.286 ms; p95 14.504; MAD 0.21071; 3 samples / 22 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.middle`](./render-results.json) | median 1.022 ms; p95 1.074; MAD 0.00000; 3 samples / 289 ops | median 3.770 ms; p95 3.839; MAD 0.06667; 3 samples / 80 ops |
| 4 | 100,000 | [`r4-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42596 ms; p95 0.42672; MAD 0.00085; 3 samples / 707 ops | median 7.443 ms; p95 7.494; MAD 0.05714; 3 samples / 42 ops |
| 4 | 100,000 | [`r4-100000-scroll-right.top-left`](./render-results.json) | median 0.25534 ms; p95 0.27833; MAD 0.02554; 3 samples / 1334 ops | median 10.170 ms; p95 10.215; MAD 0.05000; 3 samples / 30 ops |
| 4 | 100,000 | [`r4-100000-edit-open.top-left`](./render-results.json) | median 0.49505 ms; p95 0.54924; MAD 0.06021; 3 samples / 644 ops | median 0.91835 ms; p95 0.98916; MAD 0.02808; 3 samples / 323 ops |
| 4 | 100,000 | [`r4-100000-edit-open.middle`](./render-results.json) | median 0.53817 ms; p95 0.54832; MAD 0.01128; 3 samples / 577 ops | median 0.88496 ms; p95 0.89287; MAD 0.00601; 3 samples / 339 ops |
| 4 | 100,000 | [`r4-100000-edit-open.bottom-right`](./render-results.json) | median 0.47311 ms; p95 0.50931; MAD 0.04022; 3 samples / 640 ops | median 1.265 ms; p95 1.284; MAD 0.00500; 3 samples / 238 ops |
| 4 | 100,000 | [`r4-100000-edit-commit.middle`](./render-results.json) | median 0.72086 ms; p95 0.80526; MAD 0.02434; 3 samples / 406 ops | median 4.659 ms; p95 4.733; MAD 0.01364; 3 samples / 66 ops |
| 4 | 100,000 | [`r4-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.673 ms; p95 1.778; MAD 0.00667; 3 samples / 176 ops | median 14.714 ms; p95 15.139; MAD 0.15714; 3 samples / 21 ops |
| 4 | 100,000 | [`r4-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.446 ms; p95 1.493; MAD 0.05279; 3 samples / 210 ops | median 12.433 ms; p95 12.572; MAD 0.15417; 3 samples / 26 ops |
| 4 | 100,000 | [`r4-100000-arrow-down.top-left`](./render-results.json) | median 0.54754 ms; p95 0.56612; MAD 0.02064; 3 samples / 558 ops | median 1.301 ms; p95 1.311; MAD 0.01039; 3 samples / 233 ops |
| 4 | 100,000 | [`r4-100000-arrow-right.middle`](./render-results.json) | median 0.57257 ms; p95 0.60214; MAD 0.02092; 3 samples / 523 ops | median 1.266 ms; p95 1.283; MAD 0.01837; 3 samples / 242 ops |
| 4 | 100,000 | [`r4-100000-formatted-paint.top-left`](./render-results.json) | median 0.38538 ms; p95 0.44804; MAD 0.00689; 3 samples / 745 ops | median 3.268 ms; p95 3.492; MAD 0.05524; 3 samples / 92 ops |
| 4 | 100,000 | [`r4-100000-merge-heavy.paint`](./render-results.json) | median 0.00365 ms; p95 0.00389; MAD 0.00001; 3 samples / 80489 ops | median 3.390 ms; p95 3.637; MAD 0.02667; 3 samples / 88 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.top-left`](./render-results.json) | median 1.251 ms; p95 1.277; MAD 0.02850; 3 samples / 246 ops | median 14.188 ms; p95 14.255; MAD 0.07500; 3 samples / 24 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.middle`](./render-results.json) | median 1.140 ms; p95 1.162; MAD 0.02350; 3 samples / 267 ops | median 3.774 ms; p95 3.837; MAD 0.07037; 3 samples / 82 ops |
| 5 | 100,000 | [`r5-100000-scroll-smooth.same-window`](./render-results.json) | median 0.43420 ms; p95 0.44404; MAD 0.01005; 3 samples / 693 ops | median 7.400 ms; p95 7.406; MAD 0.00714; 3 samples / 42 ops |
| 5 | 100,000 | [`r5-100000-scroll-right.top-left`](./render-results.json) | median 0.25772 ms; p95 0.27787; MAD 0.02239; 3 samples / 1317 ops | median 10.170 ms; p95 10.242; MAD 0.02000; 3 samples / 30 ops |
| 5 | 100,000 | [`r5-100000-edit-open.top-left`](./render-results.json) | median 0.49167 ms; p95 0.50553; MAD 0.01540; 3 samples / 631 ops | median 1.010 ms; p95 1.021; MAD 0.01245; 3 samples / 302 ops |
| 5 | 100,000 | [`r5-100000-edit-open.middle`](./render-results.json) | median 0.49659 ms; p95 0.51068; MAD 0.00829; 3 samples / 606 ops | median 0.99505 ms; p95 1.012; MAD 0.01909; 3 samples / 317 ops |
| 5 | 100,000 | [`r5-100000-edit-open.bottom-right`](./render-results.json) | median 0.41792 ms; p95 0.46319; MAD 0.00083; 3 samples / 694 ops | median 1.264 ms; p95 1.380; MAD 0.01560; 3 samples / 233 ops |
| 5 | 100,000 | [`r5-100000-edit-commit.middle`](./render-results.json) | median 0.75758 ms; p95 0.81219; MAD 0.03294; 3 samples / 396 ops | median 5.353 ms; p95 5.462; MAD 0.12105; 3 samples / 58 ops |
| 5 | 100,000 | [`r5-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.768 ms; p95 1.908; MAD 0.02877; 3 samples / 167 ops | median 13.325 ms; p95 14.146; MAD 0.58750; 3 samples / 24 ops |
| 5 | 100,000 | [`r5-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.459 ms; p95 1.505; MAD 0.03829; 3 samples / 207 ops | median 11.967 ms; p95 12.863; MAD 0.04444; 3 samples / 26 ops |
| 5 | 100,000 | [`r5-100000-arrow-down.top-left`](./render-results.json) | median 0.59702 ms; p95 0.61692; MAD 0.02211; 3 samples / 508 ops | median 1.321 ms; p95 1.401; MAD 0.02490; 3 samples / 226 ops |
| 5 | 100,000 | [`r5-100000-arrow-right.middle`](./render-results.json) | median 0.54348 ms; p95 0.60089; MAD 0.03691; 3 samples / 547 ops | median 1.384 ms; p95 1.387; MAD 0.00411; 3 samples / 221 ops |
| 5 | 100,000 | [`r5-100000-formatted-paint.top-left`](./render-results.json) | median 0.42101 ms; p95 0.43042; MAD 0.01046; 3 samples / 730 ops | median 3.303 ms; p95 3.326; MAD 0.02581; 3 samples / 93 ops |
| 5 | 100,000 | [`r5-100000-merge-heavy.paint`](./render-results.json) | median 0.00371 ms; p95 0.00382; MAD 0.00012; 3 samples / 86640 ops | median 3.752 ms; p95 3.772; MAD 0.02222; 3 samples / 84 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.top-left`](./render-results.json) | median 1.067 ms; p95 1.144; MAD 0.01228; 3 samples / 276 ops | median 16.200 ms; p95 16.200; MAD 0.00000; 3 samples / 21 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.middle`](./render-results.json) | median 1.042 ms; p95 1.055; MAD 0.01457; 3 samples / 295 ops | median 4.258 ms; p95 4.285; MAD 0.02083; 3 samples / 72 ops |
| 6 | 100,000 | [`r6-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42723 ms; p95 0.43053; MAD 0.00367; 3 samples / 706 ops | median 8.508 ms; p95 9.049; MAD 0.00833; 3 samples / 35 ops |
| 6 | 100,000 | [`r6-100000-scroll-right.top-left`](./render-results.json) | median 0.27399 ms; p95 0.29108; MAD 0.01899; 3 samples / 1191 ops | median 11.667 ms; p95 11.717; MAD 0.05556; 3 samples / 27 ops |
| 6 | 100,000 | [`r6-100000-edit-open.top-left`](./render-results.json) | median 0.42863 ms; p95 0.60187; MAD 0.02541; 3 samples / 643 ops | median 0.94019 ms; p95 0.95630; MAD 0.01791; 3 samples / 325 ops |
| 6 | 100,000 | [`r6-100000-edit-open.middle`](./render-results.json) | median 0.53175 ms; p95 0.58365; MAD 0.00766; 3 samples / 550 ops | median 0.90270 ms; p95 0.98760; MAD 0.02200; 3 samples / 326 ops |
| 6 | 100,000 | [`r6-100000-edit-open.bottom-right`](./render-results.json) | median 0.40607 ms; p95 0.47252; MAD 0.02436; 3 samples / 724 ops | median 1.251 ms; p95 1.433; MAD 0.00310; 3 samples / 230 ops |
| 6 | 100,000 | [`r6-100000-edit-commit.middle`](./render-results.json) | median 0.70704 ms; p95 0.72614; MAD 0.02122; 3 samples / 436 ops | median 4.650 ms; p95 4.875; MAD 0.02727; 3 samples / 65 ops |
| 6 | 100,000 | [`r6-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.770 ms; p95 1.818; MAD 0.05346; 3 samples / 171 ops | median 12.433 ms; p95 13.776; MAD 0.21111; 3 samples / 26 ops |
| 6 | 100,000 | [`r6-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.567 ms; p95 1.571; MAD 0.00469; 3 samples / 193 ops | median 12.078 ms; p95 12.627; MAD 0.60972; 3 samples / 26 ops |
| 6 | 100,000 | [`r6-100000-arrow-down.top-left`](./render-results.json) | median 0.55580 ms; p95 0.59237; MAD 0.01124; 3 samples / 533 ops | median 1.316 ms; p95 1.400; MAD 0.04090; 3 samples / 227 ops |
| 6 | 100,000 | [`r6-100000-arrow-right.middle`](./render-results.json) | median 0.60667 ms; p95 0.60945; MAD 0.00309; 3 samples / 500 ops | median 1.366 ms; p95 1.371; MAD 0.00502; 3 samples / 222 ops |
| 6 | 100,000 | [`r6-100000-formatted-paint.top-left`](./render-results.json) | median 0.41883 ms; p95 0.44131; MAD 0.00618; 3 samples / 710 ops | median 3.194 ms; p95 3.809; MAD 0.01250; 3 samples / 90 ops |
| 6 | 100,000 | [`r6-100000-merge-heavy.paint`](./render-results.json) | median 0.00319 ms; p95 0.00321; MAD 0.00001; 3 samples / 93918 ops | median 3.888 ms; p95 3.937; MAD 0.05385; 3 samples / 79 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.top-left`](./render-results.json) | median 1.111 ms; p95 1.175; MAD 0.02939; 3 samples / 268 ops | median 16.057 ms; p95 16.083; MAD 0.02857; 3 samples / 21 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.middle`](./render-results.json) | median 1.118 ms; p95 1.159; MAD 0.04618; 3 samples / 271 ops | median 3.848 ms; p95 3.891; MAD 0.04801; 3 samples / 81 ops |
| 7 | 100,000 | [`r7-100000-scroll-smooth.same-window`](./render-results.json) | median 0.38687 ms; p95 0.42739; MAD 0.00695; 3 samples / 755 ops | median 8.492 ms; p95 8.567; MAD 0.00833; 3 samples / 36 ops |
| 7 | 100,000 | [`r7-100000-scroll-right.top-left`](./render-results.json) | median 0.26204 ms; p95 0.26499; MAD 0.00328; 3 samples / 1273 ops | median 11.578 ms; p95 11.648; MAD 0.00000; 3 samples / 27 ops |
| 7 | 100,000 | [`r7-100000-edit-open.top-left`](./render-results.json) | median 0.46343 ms; p95 0.48455; MAD 0.02347; 3 samples / 675 ops | median 1.038 ms; p95 1.075; MAD 0.03214; 3 samples / 290 ops |
| 7 | 100,000 | [`r7-100000-edit-open.middle`](./render-results.json) | median 0.52737 ms; p95 0.52932; MAD 0.00217; 3 samples / 604 ops | median 1.021 ms; p95 1.040; MAD 0.01143; 3 samples / 294 ops |
| 7 | 100,000 | [`r7-100000-edit-open.bottom-right`](./render-results.json) | median 0.44522 ms; p95 0.47808; MAD 0.03651; 3 samples / 683 ops | median 1.481 ms; p95 1.486; MAD 0.00588; 3 samples / 206 ops |
| 7 | 100,000 | [`r7-100000-edit-commit.middle`](./render-results.json) | median 0.71678 ms; p95 0.73190; MAD 0.01679; 3 samples / 428 ops | median 5.145 ms; p95 5.204; MAD 0.06500; 3 samples / 60 ops |
| 7 | 100,000 | [`r7-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.707 ms; p95 1.753; MAD 0.02845; 3 samples / 176 ops | median 12.638 ms; p95 13.819; MAD 0.40417; 3 samples / 25 ops |
| 7 | 100,000 | [`r7-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.446 ms; p95 1.516; MAD 0.03163; 3 samples / 207 ops | median 13.400 ms; p95 13.535; MAD 0.15000; 3 samples / 25 ops |
| 7 | 100,000 | [`r7-100000-arrow-down.top-left`](./render-results.json) | median 0.58941 ms; p95 0.64336; MAD 0.03330; 3 samples / 504 ops | median 1.524 ms; p95 1.544; MAD 0.00758; 3 samples / 201 ops |
| 7 | 100,000 | [`r7-100000-arrow-right.middle`](./render-results.json) | median 0.64910 ms; p95 0.64933; MAD 0.00025; 3 samples / 493 ops | median 1.368 ms; p95 1.379; MAD 0.01325; 3 samples / 222 ops |
| 7 | 100,000 | [`r7-100000-formatted-paint.top-left`](./render-results.json) | median 0.40650 ms; p95 0.42663; MAD 0.00610; 3 samples / 742 ops | median 3.646 ms; p95 3.899; MAD 0.03929; 3 samples / 82 ops |
| 7 | 100,000 | [`r7-100000-merge-heavy.paint`](./render-results.json) | median 0.00361 ms; p95 0.00382; MAD 0.00001; 3 samples / 81553 ops | median 3.778 ms; p95 3.828; MAD 0.00741; 3 samples / 81 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.top-left`](./render-results.json) | median 1.163 ms; p95 1.176; MAD 0.01486; 3 samples / 259 ops | median 16.100 ms; p95 16.229; MAD 0.14286; 3 samples / 21 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.middle`](./render-results.json) | median 1.061 ms; p95 1.065; MAD 0.00384; 3 samples / 290 ops | median 3.767 ms; p95 3.797; MAD 0.03333; 3 samples / 82 ops |
| 8 | 100,000 | [`r8-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39488 ms; p95 0.39841; MAD 0.00392; 3 samples / 763 ops | median 7.414 ms; p95 7.459; MAD 0.05000; 3 samples / 42 ops |
| 8 | 100,000 | [`r8-100000-scroll-right.top-left`](./render-results.json) | median 0.25082 ms; p95 0.26216; MAD 0.00667; 3 samples / 1258 ops | median 10.070 ms; p95 10.106; MAD 0.04000; 3 samples / 31 ops |
| 8 | 100,000 | [`r8-100000-edit-open.top-left`](./render-results.json) | median 0.44732 ms; p95 0.49653; MAD 0.00889; 3 samples / 653 ops | median 0.91455 ms; p95 0.94221; MAD 0.01722; 3 samples / 328 ops |
| 8 | 100,000 | [`r8-100000-edit-open.middle`](./render-results.json) | median 0.57371 ms; p95 0.60008; MAD 0.02930; 3 samples / 538 ops | median 0.89732 ms; p95 0.89893; MAD 0.00179; 3 samples / 337 ops |
| 8 | 100,000 | [`r8-100000-edit-open.bottom-right`](./render-results.json) | median 0.44888 ms; p95 0.46869; MAD 0.02201; 3 samples / 685 ops | median 1.446 ms; p95 1.467; MAD 0.02385; 3 samples / 212 ops |
| 8 | 100,000 | [`r8-100000-edit-commit.middle`](./render-results.json) | median 0.71571 ms; p95 0.73797; MAD 0.02473; 3 samples / 424 ops | median 4.810 ms; p95 5.317; MAD 0.04762; 3 samples / 61 ops |
| 8 | 100,000 | [`r8-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.820 ms; p95 1.828; MAD 0.00857; 3 samples / 168 ops | median 13.350 ms; p95 14.398; MAD 0.32500; 3 samples / 23 ops |
| 8 | 100,000 | [`r8-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.455 ms; p95 1.520; MAD 0.01364; 3 samples / 205 ops | median 11.589 ms; p95 11.659; MAD 0.07778; 3 samples / 27 ops |
| 8 | 100,000 | [`r8-100000-arrow-down.top-left`](./render-results.json) | median 0.59231 ms; p95 0.60544; MAD 0.01459; 3 samples / 547 ops | median 1.271 ms; p95 1.280; MAD 0.00127; 3 samples / 237 ops |
| 8 | 100,000 | [`r8-100000-arrow-right.middle`](./render-results.json) | median 0.58092 ms; p95 0.61531; MAD 0.03821; 3 samples / 521 ops | median 1.206 ms; p95 1.283; MAD 0.02602; 3 samples / 246 ops |
| 8 | 100,000 | [`r8-100000-formatted-paint.top-left`](./render-results.json) | median 0.38321 ms; p95 0.40013; MAD 0.01880; 3 samples / 791 ops | median 3.611 ms; p95 3.669; MAD 0.02857; 3 samples / 84 ops |
| 8 | 100,000 | [`r8-100000-merge-heavy.paint`](./render-results.json) | median 0.00321 ms; p95 0.00323; MAD 0.00002; 3 samples / 93627 ops | median 3.763 ms; p95 3.763; MAD 0.00000; 3 samples / 81 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.top-left`](./render-results.json) | median 1.205 ms; p95 1.281; MAD 0.08498; 3 samples / 256 ops | median 14.514 ms; p95 15.877; MAD 0.60179; 3 samples / 22 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.middle`](./render-results.json) | median 1.002 ms; p95 1.041; MAD 0.01376; 3 samples / 298 ops | median 3.815 ms; p95 3.968; MAD 0.11839; 3 samples / 81 ops |
| 9 | 100,000 | [`r9-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42458 ms; p95 0.42707; MAD 0.00277; 3 samples / 713 ops | median 7.464 ms; p95 7.960; MAD 0.11429; 3 samples / 41 ops |
| 9 | 100,000 | [`r9-100000-scroll-right.top-left`](./render-results.json) | median 0.25827 ms; p95 0.28608; MAD 0.00079; 3 samples / 1165 ops | median 10.700 ms; p95 10.700; MAD 0.00000; 3 samples / 30 ops |
| 9 | 100,000 | [`r9-100000-edit-open.top-left`](./render-results.json) | median 0.44687 ms; p95 0.66236; MAD 0.04325; 3 samples / 618 ops | median 1.047 ms; p95 1.098; MAD 0.05642; 3 samples / 290 ops |
| 9 | 100,000 | [`r9-100000-edit-open.middle`](./render-results.json) | median 0.50149 ms; p95 0.54663; MAD 0.05016; 3 samples / 607 ops | median 0.98058 ms; p95 1.004; MAD 0.02642; 3 samples / 321 ops |
| 9 | 100,000 | [`r9-100000-edit-open.bottom-right`](./render-results.json) | median 0.40347 ms; p95 0.40730; MAD 0.00425; 3 samples / 759 ops | median 1.287 ms; p95 1.330; MAD 0.01629; 3 samples / 232 ops |
| 9 | 100,000 | [`r9-100000-edit-commit.middle`](./render-results.json) | median 0.66424 ms; p95 0.66942; MAD 0.00576; 3 samples / 461 ops | median 4.736 ms; p95 5.046; MAD 0.15909; 3 samples / 64 ops |
| 9 | 100,000 | [`r9-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.661 ms; p95 1.816; MAD 0.00328; 3 samples / 177 ops | median 14.371 ms; p95 15.130; MAD 0.53393; 3 samples / 22 ops |
| 9 | 100,000 | [`r9-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.597 ms; p95 1.666; MAD 0.07695; 3 samples / 195 ops | median 12.875 ms; p95 12.954; MAD 0.01250; 3 samples / 24 ops |
| 9 | 100,000 | [`r9-100000-arrow-down.top-left`](./render-results.json) | median 0.53925 ms; p95 0.54306; MAD 0.00423; 3 samples / 569 ops | median 1.273 ms; p95 1.282; MAD 0.00000; 3 samples / 236 ops |
| 9 | 100,000 | [`r9-100000-arrow-right.middle`](./render-results.json) | median 0.53529 ms; p95 0.55553; MAD 0.02248; 3 samples / 572 ops | median 1.216 ms; p95 1.219; MAD 0.00120; 3 samples / 249 ops |
| 9 | 100,000 | [`r9-100000-formatted-paint.top-left`](./render-results.json) | median 0.40161 ms; p95 0.41090; MAD 0.01033; 3 samples / 770 ops | median 3.265 ms; p95 3.294; MAD 0.02903; 3 samples / 93 ops |
| 9 | 100,000 | [`r9-100000-merge-heavy.paint`](./render-results.json) | median 0.00368 ms; p95 0.00370; MAD 0.00003; 3 samples / 81858 ops | median 3.360 ms; p95 3.360; MAD 0.00000; 3 samples / 90 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.top-left`](./render-results.json) | median 1.178 ms; p95 1.178; MAD 0.00000; 3 samples / 258 ops | median 16.129 ms; p95 16.309; MAD 0.07143; 3 samples / 21 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.middle`](./render-results.json) | median 1.092 ms; p95 1.169; MAD 0.08027; 3 samples / 276 ops | median 4.287 ms; p95 4.310; MAD 0.02500; 3 samples / 72 ops |
| 10 | 100,000 | [`r10-100000-scroll-smooth.same-window`](./render-results.json) | median 0.40321 ms; p95 0.40691; MAD 0.00410; 3 samples / 751 ops | median 8.450 ms; p95 8.495; MAD 0.05000; 3 samples / 36 ops |
| 10 | 100,000 | [`r10-100000-scroll-right.top-left`](./render-results.json) | median 0.23632 ms; p95 0.25910; MAD 0.02531; 3 samples / 1334 ops | median 11.589 ms; p95 11.599; MAD 0.01111; 3 samples / 27 ops |
| 10 | 100,000 | [`r10-100000-edit-open.top-left`](./render-results.json) | median 0.43029 ms; p95 0.44742; MAD 0.01904; 3 samples / 713 ops | median 0.90811 ms; p95 0.95879; MAD 0.00989; 3 samples / 327 ops |
| 10 | 100,000 | [`r10-100000-edit-open.middle`](./render-results.json) | median 0.55304 ms; p95 0.62658; MAD 0.03387; 3 samples / 538 ops | median 1.020 ms; p95 1.020; MAD 0.00000; 3 samples / 299 ops |
| 10 | 100,000 | [`r10-100000-edit-open.bottom-right`](./render-results.json) | median 0.45591 ms; p95 0.50014; MAD 0.04914; 3 samples / 669 ops | median 1.474 ms; p95 1.492; MAD 0.00294; 3 samples / 203 ops |
| 10 | 100,000 | [`r10-100000-edit-commit.middle`](./render-results.json) | median 0.73603 ms; p95 0.74445; MAD 0.00936; 3 samples / 416 ops | median 5.230 ms; p95 5.244; MAD 0.01500; 3 samples / 60 ops |
| 10 | 100,000 | [`r10-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.829 ms; p95 1.888; MAD 0.06525; 3 samples / 165 ops | median 15.614 ms; p95 17.116; MAD 0.30000; 3 samples / 20 ops |
| 10 | 100,000 | [`r10-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.474 ms; p95 1.508; MAD 0.03841; 3 samples / 208 ops | median 12.300 ms; p95 12.310; MAD 0.01111; 3 samples / 27 ops |
| 10 | 100,000 | [`r10-100000-arrow-down.top-left`](./render-results.json) | median 0.52356 ms; p95 0.56286; MAD 0.02206; 3 samples / 568 ops | median 1.295 ms; p95 1.310; MAD 0.01639; 3 samples / 234 ops |
| 10 | 100,000 | [`r10-100000-arrow-right.middle`](./render-results.json) | median 0.58314 ms; p95 0.60540; MAD 0.01057; 3 samples / 512 ops | median 1.205 ms; p95 1.252; MAD 0.01770; 3 samples / 250 ops |
| 10 | 100,000 | [`r10-100000-formatted-paint.top-left`](./render-results.json) | median 0.40650 ms; p95 0.41994; MAD 0.01396; 3 samples / 739 ops | median 3.265 ms; p95 3.305; MAD 0.04516; 3 samples / 94 ops |
| 10 | 100,000 | [`r10-100000-merge-heavy.paint`](./render-results.json) | median 0.00362 ms; p95 0.00362; MAD 0.00000; 3 samples / 82921 ops | median 3.528 ms; p95 3.567; MAD 0.04384; 3 samples / 87 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
