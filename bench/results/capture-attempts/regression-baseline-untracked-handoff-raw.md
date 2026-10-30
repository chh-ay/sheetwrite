# Auditable render benchmark

Protocol version: **1**  
Run ID: `303214b9-cf4f-47c8-98ea-75af5bcc7504`  
Matrix: **complete and successful**

## Environment

| Field | Value |
|:--|:--|
| Commit | `ac4ab632d80abf8d0c2986685c04ebce7747e5fa` (clean) |
| Timestamp | 2026-10-29T03:51:38.476Z |
| Runtime | Bun 1.4.4; Node 26.3.0 |
| Browser | 153.0.8010.12 |
| OS / arch | linux 7.3.0-4-cachyos / x64 |
| CPU | 12th Gen Intel(R) Core(TM) i9-12900H |
| Engines | Sheetwrite 0.5.4; Handsontable 18.1.2 |
| Dataset | seed 1592639710; 100,000 rows = `fnv1a32:178eac66` |
| Viewport | 640 × 480 |
| Sampling | 1 excluded warmup aggregate(s), 3 measured aggregate(s), minimum 100 ms each |
| Counterbalance | seed 1371602926; round 1: handsontable → sheetwrite; round 2: sheetwrite → handsontable; round 3: handsontable → sheetwrite; round 4: sheetwrite → handsontable; round 5: handsontable → sheetwrite; round 6: sheetwrite → handsontable; round 7: handsontable → sheetwrite; round 8: sheetwrite → handsontable; round 9: handsontable → sheetwrite; round 10: sheetwrite → handsontable |
| Browser launches | 20 attempt(s); 0 failed attempt(s), all recorded in raw JSON |

Every cell below is linked to the raw JSON. Timings are per logical operation and use every measured sample; p95 is linearly interpolated and MAD is the median absolute deviation. Setup, cleanup, and declared warmups are excluded.

## Results

| round | rows | scenario / raw identity | Sheetwrite | Handsontable |
|---:|---:|:--|:--|:--|
| 1 | 100,000 | [`r1-100000-scroll-down.top-left`](./render-results.json) | median 1.560 ms; p95 1.569; MAD 0.01031; 3 samples / 214 ops | median 21.340 ms; p95 21.448; MAD 0.12000; 3 samples / 15 ops |
| 1 | 100,000 | [`r1-100000-scroll-down.middle`](./render-results.json) | median 1.131 ms; p95 1.289; MAD 0.03907; 3 samples / 258 ops | median 7.080 ms; p95 7.227; MAD 0.00667; 3 samples / 44 ops |
| 1 | 100,000 | [`r1-100000-scroll-smooth.same-window`](./render-results.json) | median 0.40201 ms; p95 0.44500; MAD 0.00479; 3 samples / 724 ops | median 10.730 ms; p95 10.748; MAD 0.02000; 3 samples / 30 ops |
| 1 | 100,000 | [`r1-100000-scroll-right.top-left`](./render-results.json) | median 0.27302 ms; p95 0.29243; MAD 0.02157; 3 samples / 1139 ops | median 16.400 ms; p95 16.464; MAD 0.04286; 3 samples / 21 ops |
| 1 | 100,000 | [`r1-100000-edit-open.top-left`](./render-results.json) | median 0.59059 ms; p95 0.68099; MAD 0.02336; 3 samples / 492 ops | median 1.102 ms; p95 1.481; MAD 0.00110; 3 samples / 248 ops |
| 1 | 100,000 | [`r1-100000-edit-open.middle`](./render-results.json) | median 0.62688 ms; p95 0.66540; MAD 0.01651; 3 samples / 479 ops | median 1.033 ms; p95 1.194; MAD 0.04377; 3 samples / 282 ops |
| 1 | 100,000 | [`r1-100000-edit-open.bottom-right`](./render-results.json) | median 0.55110 ms; p95 0.61122; MAD 0.03089; 3 samples / 537 ops | median 1.440 ms; p95 1.626; MAD 0.03722; 3 samples / 207 ops |
| 1 | 100,000 | [`r1-100000-edit-commit.middle`](./render-results.json) | median 0.88938 ms; p95 1.229; MAD 0.04400; 3 samples / 317 ops | median 7.679 ms; p95 8.224; MAD 0.04286; 3 samples / 41 ops |
| 1 | 100,000 | [`r1-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.896 ms; p95 1.990; MAD 0.10377; 3 samples / 165 ops | median 17.867 ms; p95 27.369; MAD 0.91667; 3 samples / 16 ops |
| 1 | 100,000 | [`r1-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.578 ms; p95 1.606; MAD 0.01250; 3 samples / 191 ops | median 14.900 ms; p95 15.774; MAD 0.20000; 3 samples / 21 ops |
| 1 | 100,000 | [`r1-100000-arrow-down.top-left`](./render-results.json) | median 0.68630 ms; p95 0.71436; MAD 0.03118; 3 samples / 448 ops | median 1.487 ms; p95 1.562; MAD 0.04819; 3 samples / 202 ops |
| 1 | 100,000 | [`r1-100000-arrow-right.middle`](./render-results.json) | median 0.71643 ms; p95 0.77503; MAD 0.06511; 3 samples / 434 ops | median 1.373 ms; p95 1.400; MAD 0.00368; 3 samples / 219 ops |
| 1 | 100,000 | [`r1-100000-formatted-paint.top-left`](./render-results.json) | median 0.00350 ms; p95 0.00368; MAD 0.00011; 3 samples / 85102 ops | median 6.100 ms; p95 7.058; MAD 0.07059; 3 samples / 48 ops |
| 1 | 100,000 | [`r1-100000-merge-heavy.paint`](./render-results.json) | median 0.00325 ms; p95 0.00326; MAD 0.00002; 3 samples / 92705 ops | median 6.444 ms; p95 6.466; MAD 0.02500; 3 samples / 48 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.top-left`](./render-results.json) | median 1.390 ms; p95 1.506; MAD 0.10053; 3 samples / 217 ops | median 21.260 ms; p95 21.422; MAD 0.18000; 3 samples / 15 ops |
| 2 | 100,000 | [`r2-100000-scroll-down.middle`](./render-results.json) | median 1.156 ms; p95 1.278; MAD 0.02374; 3 samples / 254 ops | median 7.120 ms; p95 8.474; MAD 0.41333; 3 samples / 42 ops |
| 2 | 100,000 | [`r2-100000-scroll-smooth.same-window`](./render-results.json) | median 0.40040 ms; p95 0.42708; MAD 0.00785; 3 samples / 738 ops | median 10.820 ms; p95 11.362; MAD 0.20000; 3 samples / 29 ops |
| 2 | 100,000 | [`r2-100000-scroll-right.top-left`](./render-results.json) | median 0.25471 ms; p95 0.25924; MAD 0.00503; 3 samples / 1196 ops | median 16.600 ms; p95 17.530; MAD 0.04286; 3 samples / 20 ops |
| 2 | 100,000 | [`r2-100000-edit-open.top-left`](./render-results.json) | median 0.81707 ms; p95 0.94796; MAD 0.14543; 3 samples / 378 ops | median 1.133 ms; p95 1.388; MAD 0.04656; 3 samples / 253 ops |
| 2 | 100,000 | [`r2-100000-edit-open.middle`](./render-results.json) | median 0.66835 ms; p95 0.78900; MAD 0.00544; 3 samples / 434 ops | median 1.018 ms; p95 1.036; MAD 0.00707; 3 samples / 296 ops |
| 2 | 100,000 | [`r2-100000-edit-open.bottom-right`](./render-results.json) | median 0.57257 ms; p95 0.62998; MAD 0.06379; 3 samples / 549 ops | median 1.424 ms; p95 1.787; MAD 0.00704; 3 samples / 197 ops |
| 2 | 100,000 | [`r2-100000-edit-commit.middle`](./render-results.json) | median 0.89027 ms; p95 1.022; MAD 0.00000; 3 samples / 323 ops | median 7.679 ms; p95 7.933; MAD 0.01429; 3 samples / 41 ops |
| 2 | 100,000 | [`r2-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.975 ms; p95 2.141; MAD 0.18506; 3 samples / 156 ops | median 17.817 ms; p95 17.907; MAD 0.10000; 3 samples / 18 ops |
| 2 | 100,000 | [`r2-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.581 ms; p95 1.672; MAD 0.09412; 3 samples / 196 ops | median 15.314 ms; p95 15.726; MAD 0.28571; 3 samples / 21 ops |
| 2 | 100,000 | [`r2-100000-arrow-down.top-left`](./render-results.json) | median 0.76412 ms; p95 0.81633; MAD 0.05801; 3 samples / 407 ops | median 1.461 ms; p95 1.465; MAD 0.00435; 3 samples / 209 ops |
| 2 | 100,000 | [`r2-100000-arrow-right.middle`](./render-results.json) | median 0.63354 ms; p95 0.80475; MAD 0.02993; 3 samples / 446 ops | median 1.401 ms; p95 1.420; MAD 0.02115; 3 samples / 218 ops |
| 2 | 100,000 | [`r2-100000-formatted-paint.top-left`](./render-results.json) | median 0.00351 ms; p95 0.00378; MAD 0.00018; 3 samples / 84759 ops | median 6.306 ms; p95 6.481; MAD 0.07684; 3 samples / 49 ops |
| 2 | 100,000 | [`r2-100000-merge-heavy.paint`](./render-results.json) | median 0.00327 ms; p95 0.00328; MAD 0.00001; 3 samples / 92071 ops | median 6.387 ms; p95 6.651; MAD 0.15809; 3 samples / 48 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.top-left`](./render-results.json) | median 1.512 ms; p95 1.533; MAD 0.02308; 3 samples / 216 ops | median 21.340 ms; p95 21.880; MAD 0.54000; 3 samples / 15 ops |
| 3 | 100,000 | [`r3-100000-scroll-down.middle`](./render-results.json) | median 1.129 ms; p95 1.228; MAD 0.05287; 3 samples / 263 ops | median 6.787 ms; p95 8.983; MAD 0.01333; 3 samples / 41 ops |
| 3 | 100,000 | [`r3-100000-scroll-smooth.same-window`](./render-results.json) | median 0.40898 ms; p95 0.45374; MAD 0.01254; 3 samples / 716 ops | median 10.720 ms; p95 10.765; MAD 0.05000; 3 samples / 30 ops |
| 3 | 100,000 | [`r3-100000-scroll-right.top-left`](./render-results.json) | median 0.23923 ms; p95 0.27323; MAD 0.00426; 3 samples / 1205 ops | median 16.586 ms; p95 17.844; MAD 0.00000; 3 samples / 20 ops |
| 3 | 100,000 | [`r3-100000-edit-open.top-left`](./render-results.json) | median 0.63822 ms; p95 0.64132; MAD 0.00345; 3 samples / 479 ops | median 1.134 ms; p95 1.173; MAD 0.01037; 3 samples / 264 ops |
| 3 | 100,000 | [`r3-100000-edit-open.middle`](./render-results.json) | median 0.66867 ms; p95 0.82425; MAD 0.04953; 3 samples / 442 ops | median 1.043 ms; p95 1.108; MAD 0.01516; 3 samples / 284 ops |
| 3 | 100,000 | [`r3-100000-edit-open.bottom-right`](./render-results.json) | median 0.53016 ms; p95 0.56066; MAD 0.02153; 3 samples / 564 ops | median 1.465 ms; p95 1.677; MAD 0.02665; 3 samples / 198 ops |
| 3 | 100,000 | [`r3-100000-edit-commit.middle`](./render-results.json) | median 0.88761 ms; p95 1.237; MAD 0.00088; 3 samples / 305 ops | median 8.046 ms; p95 8.060; MAD 0.01538; 3 samples / 39 ops |
| 3 | 100,000 | [`r3-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.893 ms; p95 2.050; MAD 0.06000; 3 samples / 159 ops | median 16.471 ms; p95 16.992; MAD 0.57857; 3 samples / 20 ops |
| 3 | 100,000 | [`r3-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.695 ms; p95 1.758; MAD 0.05065; 3 samples / 177 ops | median 15.300 ms; p95 15.326; MAD 0.02857; 3 samples / 21 ops |
| 3 | 100,000 | [`r3-100000-arrow-down.top-left`](./render-results.json) | median 0.68299 ms; p95 0.69147; MAD 0.00942; 3 samples / 447 ops | median 1.485 ms; p95 1.503; MAD 0.01918; 3 samples / 204 ops |
| 3 | 100,000 | [`r3-100000-arrow-right.middle`](./render-results.json) | median 0.65556 ms; p95 0.68261; MAD 0.03006; 3 samples / 467 ops | median 1.382 ms; p95 1.398; MAD 0.01781; 3 samples / 221 ops |
| 3 | 100,000 | [`r3-100000-formatted-paint.top-left`](./render-results.json) | median 0.00362 ms; p95 0.00383; MAD 0.00021; 3 samples / 82927 ops | median 6.106 ms; p95 6.303; MAD 0.02353; 3 samples / 50 ops |
| 3 | 100,000 | [`r3-100000-merge-heavy.paint`](./render-results.json) | median 0.00326 ms; p95 0.00326; MAD 0.00000; 3 samples / 92404 ops | median 6.475 ms; p95 6.503; MAD 0.03125; 3 samples / 48 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.top-left`](./render-results.json) | median 1.379 ms; p95 1.523; MAD 0.15901; 3 samples / 223 ops | median 21.880 ms; p95 21.934; MAD 0.06000; 3 samples / 15 ops |
| 4 | 100,000 | [`r4-100000-scroll-down.middle`](./render-results.json) | median 1.252 ms; p95 1.336; MAD 0.09283; 3 samples / 244 ops | median 7.421 ms; p95 8.790; MAD 0.54143; 3 samples / 41 ops |
| 4 | 100,000 | [`r4-100000-scroll-smooth.same-window`](./render-results.json) | median 0.41618 ms; p95 0.45678; MAD 0.02053; 3 samples / 711 ops | median 10.710 ms; p95 10.746; MAD 0.03000; 3 samples / 30 ops |
| 4 | 100,000 | [`r4-100000-scroll-right.top-left`](./render-results.json) | median 0.26784 ms; p95 0.27003; MAD 0.00243; 3 samples / 1189 ops | median 16.683 ms; p95 17.718; MAD 0.06905; 3 samples / 19 ops |
| 4 | 100,000 | [`r4-100000-edit-open.top-left`](./render-results.json) | median 0.93738 ms; p95 0.99464; MAD 0.06362; 3 samples / 357 ops | median 1.227 ms; p95 1.310; MAD 0.09291; 3 samples / 252 ops |
| 4 | 100,000 | [`r4-100000-edit-open.middle`](./render-results.json) | median 0.67152 ms; p95 0.71194; MAD 0.03331; 3 samples / 448 ops | median 1.040 ms; p95 1.062; MAD 0.02469; 3 samples / 292 ops |
| 4 | 100,000 | [`r4-100000-edit-open.bottom-right`](./render-results.json) | median 0.54754 ms; p95 0.56904; MAD 0.02389; 3 samples / 556 ops | median 1.441 ms; p95 1.785; MAD 0.03016; 3 samples / 197 ops |
| 4 | 100,000 | [`r4-100000-edit-commit.middle`](./render-results.json) | median 1.036 ms; p95 1.102; MAD 0.07359; 3 samples / 304 ops | median 7.693 ms; p95 7.879; MAD 0.05000; 3 samples / 41 ops |
| 4 | 100,000 | [`r4-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.952 ms; p95 1.970; MAD 0.02063; 3 samples / 163 ops | median 16.900 ms; p95 18.505; MAD 0.78571; 3 samples / 19 ops |
| 4 | 100,000 | [`r4-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.729 ms; p95 1.839; MAD 0.07849; 3 samples / 177 ops | median 14.986 ms; p95 15.243; MAD 0.28571; 3 samples / 21 ops |
| 4 | 100,000 | [`r4-100000-arrow-down.top-left`](./render-results.json) | median 0.74519 ms; p95 0.77359; MAD 0.03156; 3 samples / 423 ops | median 1.449 ms; p95 1.454; MAD 0.00356; 3 samples / 208 ops |
| 4 | 100,000 | [`r4-100000-arrow-right.middle`](./render-results.json) | median 0.75758 ms; p95 0.78899; MAD 0.01419; 3 samples / 401 ops | median 1.393 ms; p95 1.416; MAD 0.02525; 3 samples / 217 ops |
| 4 | 100,000 | [`r4-100000-formatted-paint.top-left`](./render-results.json) | median 0.00367 ms; p95 0.00385; MAD 0.00012; 3 samples / 81402 ops | median 6.400 ms; p95 6.574; MAD 0.19375; 3 samples / 49 ops |
| 4 | 100,000 | [`r4-100000-merge-heavy.paint`](./render-results.json) | median 0.00323 ms; p95 0.00325; MAD 0.00001; 3 samples / 92738 ops | median 6.337 ms; p95 6.484; MAD 0.06250; 3 samples / 48 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.top-left`](./render-results.json) | median 1.382 ms; p95 1.468; MAD 0.09575; 3 samples / 225 ops | median 21.760 ms; p95 22.012; MAD 0.28000; 3 samples / 15 ops |
| 5 | 100,000 | [`r5-100000-scroll-down.middle`](./render-results.json) | median 1.260 ms; p95 1.407; MAD 0.16278; 3 samples / 252 ops | median 6.753 ms; p95 7.910; MAD 0.10333; 3 samples / 44 ops |
| 5 | 100,000 | [`r5-100000-scroll-smooth.same-window`](./render-results.json) | median 0.41364 ms; p95 0.41869; MAD 0.00425; 3 samples / 726 ops | median 10.540 ms; p95 10.837; MAD 0.16000; 3 samples / 30 ops |
| 5 | 100,000 | [`r5-100000-scroll-right.top-left`](./render-results.json) | median 0.27473 ms; p95 0.30014; MAD 0.00964; 3 samples / 1123 ops | median 16.557 ms; p95 16.746; MAD 0.02857; 3 samples / 20 ops |
| 5 | 100,000 | [`r5-100000-edit-open.top-left`](./render-results.json) | median 0.62174 ms; p95 0.67540; MAD 0.01752; 3 samples / 488 ops | median 1.184 ms; p95 1.259; MAD 0.08356; 3 samples / 261 ops |
| 5 | 100,000 | [`r5-100000-edit-open.middle`](./render-results.json) | median 0.67383 ms; p95 0.81261; MAD 0.04427; 3 samples / 440 ops | median 1.020 ms; p95 1.045; MAD 0.00122; 3 samples / 293 ops |
| 5 | 100,000 | [`r5-100000-edit-open.bottom-right`](./render-results.json) | median 0.53245 ms; p95 0.56223; MAD 0.00455; 3 samples / 555 ops | median 1.449 ms; p95 1.579; MAD 0.06023; 3 samples / 205 ops |
| 5 | 100,000 | [`r5-100000-edit-commit.middle`](./render-results.json) | median 0.91091 ms; p95 1.007; MAD 0.02064; 3 samples / 322 ops | median 7.769 ms; p95 7.908; MAD 0.07637; 3 samples / 40 ops |
| 5 | 100,000 | [`r5-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.802 ms; p95 2.063; MAD 0.01679; 3 samples / 164 ops | median 17.783 ms; p95 18.923; MAD 0.13333; 3 samples / 18 ops |
| 5 | 100,000 | [`r5-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.705 ms; p95 1.717; MAD 0.01356; 3 samples / 182 ops | median 15.371 ms; p95 15.757; MAD 0.14286; 3 samples / 21 ops |
| 5 | 100,000 | [`r5-100000-arrow-down.top-left`](./render-results.json) | median 0.77007 ms; p95 0.81610; MAD 0.04399; 3 samples / 407 ops | median 1.464 ms; p95 1.543; MAD 0.01304; 3 samples / 203 ops |
| 5 | 100,000 | [`r5-100000-arrow-right.middle`](./render-results.json) | median 0.71824 ms; p95 0.75055; MAD 0.03589; 3 samples / 457 ops | median 1.381 ms; p95 1.403; MAD 0.02473; 3 samples / 220 ops |
| 5 | 100,000 | [`r5-100000-formatted-paint.top-left`](./render-results.json) | median 0.00387 ms; p95 0.00390; MAD 0.00003; 3 samples / 79683 ops | median 6.171 ms; p95 8.132; MAD 0.02941; 3 samples / 46 ops |
| 5 | 100,000 | [`r5-100000-merge-heavy.paint`](./render-results.json) | median 0.00319 ms; p95 0.00321; MAD 0.00003; 3 samples / 94438 ops | median 6.350 ms; p95 6.418; MAD 0.06250; 3 samples / 48 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.top-left`](./render-results.json) | median 1.393 ms; p95 1.431; MAD 0.04157; 3 samples / 229 ops | median 21.620 ms; p95 21.998; MAD 0.42000; 3 samples / 15 ops |
| 6 | 100,000 | [`r6-100000-scroll-down.middle`](./render-results.json) | median 1.100 ms; p95 1.373; MAD 0.02872; 3 samples / 257 ops | median 7.020 ms; p95 8.397; MAD 0.16000; 3 samples / 42 ops |
| 6 | 100,000 | [`r6-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42321 ms; p95 0.45037; MAD 0.00654; 3 samples / 698 ops | median 10.740 ms; p95 11.444; MAD 0.13000; 3 samples / 29 ops |
| 6 | 100,000 | [`r6-100000-scroll-right.top-left`](./render-results.json) | median 0.26068 ms; p95 0.28865; MAD 0.00790; 3 samples / 1156 ops | median 16.667 ms; p95 17.687; MAD 0.00952; 3 samples / 19 ops |
| 6 | 100,000 | [`r6-100000-edit-open.top-left`](./render-results.json) | median 0.62687 ms; p95 0.73069; MAD 0.04432; 3 samples / 467 ops | median 1.182 ms; p95 1.265; MAD 0.08125; 3 samples / 255 ops |
| 6 | 100,000 | [`r6-100000-edit-open.middle`](./render-results.json) | median 0.62893 ms; p95 0.75536; MAD 0.04355; 3 samples / 464 ops | median 1.032 ms; p95 1.081; MAD 0.00645; 3 samples / 288 ops |
| 6 | 100,000 | [`r6-100000-edit-open.bottom-right`](./render-results.json) | median 0.53529 ms; p95 0.57428; MAD 0.03024; 3 samples / 558 ops | median 1.527 ms; p95 1.547; MAD 0.02196; 3 samples / 200 ops |
| 6 | 100,000 | [`r6-100000-edit-commit.middle`](./render-results.json) | median 1.033 ms; p95 1.083; MAD 0.03596; 3 samples / 290 ops | median 7.715 ms; p95 8.482; MAD 0.00769; 3 samples / 38 ops |
| 6 | 100,000 | [`r6-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.891 ms; p95 1.927; MAD 0.04020; 3 samples / 166 ops | median 17.483 ms; p95 17.543; MAD 0.06667; 3 samples / 18 ops |
| 6 | 100,000 | [`r6-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.598 ms; p95 1.687; MAD 0.02966; 3 samples / 186 ops | median 15.229 ms; p95 15.434; MAD 0.22857; 3 samples / 21 ops |
| 6 | 100,000 | [`r6-100000-arrow-down.top-left`](./render-results.json) | median 0.65280 ms; p95 0.76227; MAD 0.01925; 3 samples / 452 ops | median 1.530 ms; p95 1.745; MAD 0.03030; 3 samples / 190 ops |
| 6 | 100,000 | [`r6-100000-arrow-right.middle`](./render-results.json) | median 0.73897 ms; p95 0.75974; MAD 0.02307; 3 samples / 433 ops | median 1.390 ms; p95 1.523; MAD 0.02406; 3 samples / 212 ops |
| 6 | 100,000 | [`r6-100000-formatted-paint.top-left`](./render-results.json) | median 0.00357 ms; p95 0.00372; MAD 0.00012; 3 samples / 83844 ops | median 6.135 ms; p95 6.278; MAD 0.15846; 3 samples / 50 ops |
| 6 | 100,000 | [`r6-100000-merge-heavy.paint`](./render-results.json) | median 0.00377 ms; p95 0.00414; MAD 0.00041; 3 samples / 82546 ops | median 6.500 ms; p95 6.528; MAD 0.03125; 3 samples / 48 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.top-left`](./render-results.json) | median 1.316 ms; p95 1.635; MAD 0.16271; 3 samples / 224 ops | median 21.780 ms; p95 21.852; MAD 0.08000; 3 samples / 15 ops |
| 7 | 100,000 | [`r7-100000-scroll-down.middle`](./render-results.json) | median 1.160 ms; p95 1.188; MAD 0.03190; 3 samples / 260 ops | median 6.913 ms; p95 8.709; MAD 0.10000; 3 samples / 42 ops |
| 7 | 100,000 | [`r7-100000-scroll-smooth.same-window`](./render-results.json) | median 0.40939 ms; p95 0.45272; MAD 0.01529; 3 samples / 718 ops | median 10.580 ms; p95 11.368; MAD 0.16000; 3 samples / 29 ops |
| 7 | 100,000 | [`r7-100000-scroll-right.top-left`](./render-results.json) | median 0.25601 ms; p95 0.26068; MAD 0.00519; 3 samples / 1275 ops | median 16.967 ms; p95 17.927; MAD 0.26667; 3 samples / 18 ops |
| 7 | 100,000 | [`r7-100000-edit-open.top-left`](./render-results.json) | median 0.57644 ms; p95 0.63514; MAD 0.05183; 3 samples / 521 ops | median 1.210 ms; p95 1.223; MAD 0.01487; 3 samples / 257 ops |
| 7 | 100,000 | [`r7-100000-edit-open.middle`](./render-results.json) | median 0.69653 ms; p95 0.76802; MAD 0.02404; 3 samples / 422 ops | median 1.065 ms; p95 1.070; MAD 0.00532; 3 samples / 283 ops |
| 7 | 100,000 | [`r7-100000-edit-open.bottom-right`](./render-results.json) | median 0.55414 ms; p95 0.61517; MAD 0.00166; 3 samples / 526 ops | median 1.440 ms; p95 1.739; MAD 0.00857; 3 samples / 197 ops |
| 7 | 100,000 | [`r7-100000-edit-commit.middle`](./render-results.json) | median 0.95429 ms; p95 1.008; MAD 0.05987; 3 samples / 331 ops | median 7.664 ms; p95 7.925; MAD 0.02143; 3 samples / 41 ops |
| 7 | 100,000 | [`r7-100000-altering.insert-5-rows-top`](./render-results.json) | median 1.831 ms; p95 2.084; MAD 0.15758; 3 samples / 163 ops | median 17.800 ms; p95 18.190; MAD 0.41667; 3 samples / 18 ops |
| 7 | 100,000 | [`r7-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.705 ms; p95 1.707; MAD 0.00169; 3 samples / 180 ops | median 15.186 ms; p95 15.584; MAD 0.05714; 3 samples / 21 ops |
| 7 | 100,000 | [`r7-100000-arrow-down.top-left`](./render-results.json) | median 0.69653 ms; p95 0.71050; MAD 0.01553; 3 samples / 469 ops | median 1.509 ms; p95 1.524; MAD 0.01680; 3 samples / 202 ops |
| 7 | 100,000 | [`r7-100000-arrow-right.middle`](./render-results.json) | median 0.71027 ms; p95 0.72628; MAD 0.01305; 3 samples / 429 ops | median 1.389 ms; p95 1.414; MAD 0.01218; 3 samples / 216 ops |
| 7 | 100,000 | [`r7-100000-formatted-paint.top-left`](./render-results.json) | median 0.00406 ms; p95 0.00430; MAD 0.00020; 3 samples / 73719 ops | median 6.235 ms; p95 8.094; MAD 0.08824; 3 samples / 47 ops |
| 7 | 100,000 | [`r7-100000-merge-heavy.paint`](./render-results.json) | median 0.00318 ms; p95 0.00319; MAD 0.00001; 3 samples / 94462 ops | median 6.462 ms; p95 6.491; MAD 0.03125; 3 samples / 48 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.top-left`](./render-results.json) | median 1.486 ms; p95 1.522; MAD 0.04000; 3 samples / 223 ops | median 21.720 ms; p95 21.810; MAD 0.10000; 3 samples / 15 ops |
| 8 | 100,000 | [`r8-100000-scroll-down.middle`](./render-results.json) | median 1.133 ms; p95 1.351; MAD 0.00562; 3 samples / 256 ops | median 6.927 ms; p95 8.230; MAD 0.12000; 3 samples / 42 ops |
| 8 | 100,000 | [`r8-100000-scroll-smooth.same-window`](./render-results.json) | median 0.42167 ms; p95 0.42390; MAD 0.00249; 3 samples / 730 ops | median 10.650 ms; p95 11.205; MAD 0.03000; 3 samples / 29 ops |
| 8 | 100,000 | [`r8-100000-scroll-right.top-left`](./render-results.json) | median 0.25463 ms; p95 0.31056; MAD 0.02219; 3 samples / 1184 ops | median 16.529 ms; p95 17.418; MAD 0.10000; 3 samples / 20 ops |
| 8 | 100,000 | [`r8-100000-edit-open.top-left`](./render-results.json) | median 0.64231 ms; p95 0.67067; MAD 0.03152; 3 samples / 483 ops | median 1.157 ms; p95 1.617; MAD 0.04571; 3 samples / 238 ops |
| 8 | 100,000 | [`r8-100000-edit-open.middle`](./render-results.json) | median 0.71135 ms; p95 0.76980; MAD 0.05448; 3 samples / 429 ops | median 1.040 ms; p95 1.042; MAD 0.00146; 3 samples / 291 ops |
| 8 | 100,000 | [`r8-100000-edit-open.bottom-right`](./render-results.json) | median 0.57471 ms; p95 0.57874; MAD 0.00448; 3 samples / 548 ops | median 1.471 ms; p95 1.588; MAD 0.00972; 3 samples / 200 ops |
| 8 | 100,000 | [`r8-100000-edit-commit.middle`](./render-results.json) | median 1.152 ms; p95 1.157; MAD 0.00575; 3 samples / 277 ops | median 7.707 ms; p95 8.123; MAD 0.13571; 3 samples / 41 ops |
| 8 | 100,000 | [`r8-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.102 ms; p95 2.147; MAD 0.05000; 3 samples / 159 ops | median 17.033 ms; p95 18.353; MAD 0.99048; 3 samples / 19 ops |
| 8 | 100,000 | [`r8-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.705 ms; p95 1.846; MAD 0.00339; 3 samples / 172 ops | median 14.943 ms; p95 15.226; MAD 0.31429; 3 samples / 21 ops |
| 8 | 100,000 | [`r8-100000-arrow-down.top-left`](./render-results.json) | median 0.70280 ms; p95 0.80491; MAD 0.10340; 3 samples / 433 ops | median 1.474 ms; p95 1.483; MAD 0.01029; 3 samples / 206 ops |
| 8 | 100,000 | [`r8-100000-arrow-right.middle`](./render-results.json) | median 0.76667 ms; p95 0.77417; MAD 0.00833; 3 samples / 416 ops | median 1.328 ms; p95 1.378; MAD 0.00658; 3 samples / 225 ops |
| 8 | 100,000 | [`r8-100000-formatted-paint.top-left`](./render-results.json) | median 0.00384 ms; p95 0.00386; MAD 0.00003; 3 samples / 78458 ops | median 6.153 ms; p95 6.747; MAD 0.02941; 3 samples / 49 ops |
| 8 | 100,000 | [`r8-100000-merge-heavy.paint`](./render-results.json) | median 0.00331 ms; p95 0.00331; MAD 0.00000; 3 samples / 90937 ops | median 6.256 ms; p95 6.262; MAD 0.00625; 3 samples / 49 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.top-left`](./render-results.json) | median 1.529 ms; p95 1.634; MAD 0.11711; 3 samples / 214 ops | median 20.620 ms; p95 20.728; MAD 0.10000; 3 samples / 15 ops |
| 9 | 100,000 | [`r9-100000-scroll-down.middle`](./render-results.json) | median 1.217 ms; p95 1.261; MAD 0.04896; 3 samples / 254 ops | median 6.960 ms; p95 8.301; MAD 0.27333; 3 samples / 42 ops |
| 9 | 100,000 | [`r9-100000-scroll-smooth.same-window`](./render-results.json) | median 0.40732 ms; p95 0.41492; MAD 0.00652; 3 samples / 737 ops | median 10.690 ms; p95 11.259; MAD 0.01000; 3 samples / 29 ops |
| 9 | 100,000 | [`r9-100000-scroll-right.top-left`](./render-results.json) | median 0.28405 ms; p95 0.28827; MAD 0.00469; 3 samples / 1145 ops | median 16.717 ms; p95 17.797; MAD 0.31667; 3 samples / 19 ops |
| 9 | 100,000 | [`r9-100000-edit-open.top-left`](./render-results.json) | median 0.62625 ms; p95 0.63116; MAD 0.00546; 3 samples / 492 ops | median 1.124 ms; p95 1.188; MAD 0.07164; 3 samples / 270 ops |
| 9 | 100,000 | [`r9-100000-edit-open.middle`](./render-results.json) | median 0.65490 ms; p95 0.68698; MAD 0.00131; 3 samples / 454 ops | median 1.035 ms; p95 1.065; MAD 0.03005; 3 samples / 291 ops |
| 9 | 100,000 | [`r9-100000-edit-open.bottom-right`](./render-results.json) | median 0.56610 ms; p95 0.57192; MAD 0.00647; 3 samples / 553 ops | median 1.418 ms; p95 1.551; MAD 0.06290; 3 samples / 209 ops |
| 9 | 100,000 | [`r9-100000-edit-commit.middle`](./render-results.json) | median 1.143 ms; p95 1.214; MAD 0.01172; 3 samples / 260 ops | median 7.579 ms; p95 7.729; MAD 0.04286; 3 samples / 41 ops |
| 9 | 100,000 | [`r9-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.000 ms; p95 2.099; MAD 0.11042; 3 samples / 164 ops | median 17.133 ms; p95 17.403; MAD 0.05000; 3 samples / 18 ops |
| 9 | 100,000 | [`r9-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.643 ms; p95 1.705; MAD 0.06924; 3 samples / 186 ops | median 15.429 ms; p95 16.110; MAD 0.75714; 3 samples / 21 ops |
| 9 | 100,000 | [`r9-100000-arrow-down.top-left`](./render-results.json) | median 0.69241 ms; p95 0.72815; MAD 0.03970; 3 samples / 439 ops | median 1.457 ms; p95 1.476; MAD 0.01081; 3 samples / 207 ops |
| 9 | 100,000 | [`r9-100000-arrow-right.middle`](./render-results.json) | median 0.67181 ms; p95 0.82018; MAD 0.09320; 3 samples / 442 ops | median 1.554 ms; p95 1.585; MAD 0.03448; 3 samples / 207 ops |
| 9 | 100,000 | [`r9-100000-formatted-paint.top-left`](./render-results.json) | median 0.00358 ms; p95 0.00400; MAD 0.00011; 3 samples / 81848 ops | median 6.088 ms; p95 6.131; MAD 0.04706; 3 samples / 51 ops |
| 9 | 100,000 | [`r9-100000-merge-heavy.paint`](./render-results.json) | median 0.00318 ms; p95 0.00321; MAD 0.00000; 3 samples / 94133 ops | median 6.263 ms; p95 6.448; MAD 0.01250; 3 samples / 48 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.top-left`](./render-results.json) | median 1.314 ms; p95 1.532; MAD 0.06842; 3 samples / 226 ops | median 21.460 ms; p95 21.856; MAD 0.44000; 3 samples / 15 ops |
| 10 | 100,000 | [`r10-100000-scroll-down.middle`](./render-results.json) | median 1.268 ms; p95 1.490; MAD 0.10743; 3 samples / 239 ops | median 7.150 ms; p95 7.311; MAD 0.17857; 3 samples / 44 ops |
| 10 | 100,000 | [`r10-100000-scroll-smooth.same-window`](./render-results.json) | median 0.39880 ms; p95 0.44569; MAD 0.00586; 3 samples / 728 ops | median 10.560 ms; p95 10.677; MAD 0.03000; 3 samples / 30 ops |
| 10 | 100,000 | [`r10-100000-scroll-right.top-left`](./render-results.json) | median 0.25344 ms; p95 0.33514; MAD 0.00619; 3 samples / 1134 ops | median 16.529 ms; p95 16.580; MAD 0.05714; 3 samples / 21 ops |
| 10 | 100,000 | [`r10-100000-edit-open.top-left`](./render-results.json) | median 0.59524 ms; p95 0.69640; MAD 0.10834; 3 samples / 518 ops | median 1.198 ms; p95 1.411; MAD 0.16566; 3 samples / 251 ops |
| 10 | 100,000 | [`r10-100000-edit-open.middle`](./render-results.json) | median 0.68767 ms; p95 0.70128; MAD 0.01513; 3 samples / 445 ops | median 1.046 ms; p95 1.076; MAD 0.03186; 3 samples / 292 ops |
| 10 | 100,000 | [`r10-100000-edit-open.bottom-right`](./render-results.json) | median 0.56298 ms; p95 0.63133; MAD 0.01380; 3 samples / 531 ops | median 1.467 ms; p95 1.482; MAD 0.00725; 3 samples / 206 ops |
| 10 | 100,000 | [`r10-100000-edit-commit.middle`](./render-results.json) | median 1.034 ms; p95 1.141; MAD 0.11931; 3 samples / 302 ops | median 7.643 ms; p95 7.764; MAD 0.01429; 3 samples / 41 ops |
| 10 | 100,000 | [`r10-100000-altering.insert-5-rows-top`](./render-results.json) | median 2.033 ms; p95 2.227; MAD 0.21556; 3 samples / 161 ops | median 17.483 ms; p95 17.498; MAD 0.01667; 3 samples / 18 ops |
| 10 | 100,000 | [`r10-100000-altering.remove-5-rows-top`](./render-results.json) | median 1.747 ms; p95 1.873; MAD 0.03638; 3 samples / 177 ops | median 15.043 ms; p95 15.570; MAD 0.58571; 3 samples / 21 ops |
| 10 | 100,000 | [`r10-100000-arrow-down.top-left`](./render-results.json) | median 0.77674 ms; p95 0.78716; MAD 0.01158; 3 samples / 431 ops | median 1.517 ms; p95 2.964; MAD 0.06594; 3 samples / 167 ops |
| 10 | 100,000 | [`r10-100000-arrow-right.middle`](./render-results.json) | median 0.75338 ms; p95 0.77917; MAD 0.02865; 3 samples / 401 ops | median 1.407 ms; p95 1.437; MAD 0.03306; 3 samples / 216 ops |
| 10 | 100,000 | [`r10-100000-formatted-paint.top-left`](./render-results.json) | median 0.00372 ms; p95 0.00396; MAD 0.00026; 3 samples / 80880 ops | median 6.135 ms; p95 6.151; MAD 0.01765; 3 samples / 51 ops |
| 10 | 100,000 | [`r10-100000-merge-heavy.paint`](./render-results.json) | median 0.00327 ms; p95 0.00327; MAD 0.00000; 3 samples / 92085 ops | median 6.400 ms; p95 6.434; MAD 0.03750; 3 samples / 49 ops |

## Reproduce

- `bun run --filter '@sheetwrite/bench' bench:render`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine sheetwrite`
- `bun run --filter '@sheetwrite/bench' bench:render:smoke -- --engine handsontable`

The JSON artifact is authoritative. This Markdown file is generated from it and must not be edited by hand.
