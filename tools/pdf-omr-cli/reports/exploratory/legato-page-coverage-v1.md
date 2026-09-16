# LEGATO 页面覆盖几何诊断 v1

日期：2026-09-13。状态：离线可行性诊断完成，自动纠错验收未通过。
本轮新增模型调用 0 次，未修改模型配置、ABC、XML、Draft 或参考答案，识别指标不变。

后续增量已解决两处行首反复记号误计：13 页、67 个 system 的计数与独立参考核对一致。
详见文末“后续增量”；这仍不是自动纠错或音符识别收益。

## 结论

**从向量 PDF 提取小节候选区域可行，但“竖线之间的区间 = 音乐小节”不成立。**
修正一处几何聚合错误后，score-4 独立计数得到 37／38／17；但 score-9 的行首反复记号造成
21／20 误计，K280 第四页也出现同类错误。因此不把计数接入自动删尾或生成停止规则。

该结果推进的是页面覆盖约束的可行性，而不是识别准确率。即使 score-4 计数吻合，也没有证明
预测的第几个小节对应哪一个输入区域；仍不能据此删掉预测页尾。上一轮参考辅助的 93.15%
反事实分数不在本轮验收成绩中。

## 范围与证据隔离

使用三份已见开发作品，共 13 个向量 PDF 页面；另用 4945954 的 3 页扫描输入检查适用边界。
提取代码只打开原始 PDF，不读取 MXL、expected.json、模型输出、小节编号文本或人工填写的目标计数。
但作者已知 score-4 的历史诊断，且做了开发内修正；这不是盲测、预注册正式实验或未见作品验证。

原始 PDF 均未编辑。来源相对 `tools/pdf-omr-cli/`：

| 来源                                                                    | SHA-256                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [score-4.pdf](../development/piano-recognition-v1-20260905/score-4.pdf) | `5697fee05e9b695e2cf3ec68a63e6bef2a207e81b9de6a365e552256ccc57428` |
| [score-9.pdf](../development/piano-recognition-v1-20260905/score-9.pdf) | `5b7c61a760c41fc7ba2f4ff00a8cbc10acc1f07fad9cc7830a85d59016ee3b4d` |
| [k280.pdf](../development/piano-recognition-v1-20260905/k280.pdf)       | `603c92b6d485fd4465e8390ab53176e686710cf5add358fa0cf643ee9c9d4b44` |
| `corpus/olimpic-scanned-full-page-dev-v1/dev/4945954/input.pdf`         | `9041badf0af41dc69cc079b7254c74e700dcf46726ee3060182f0867d1d2c63f` |

三份开发 PDF 均有向量路径、无嵌入图像。扫描 PDF 第一页为 0 个 drawing、1 个 image，
三页提取均得到 0 个五线组；这里的 0 表示方法不适用，不能解释为乐谱没有小节。
扫描第一页还是三谱表系统，不能套用本轮相邻双谱表的布局假设。

## 方法与失败记录

先按 y 合并横线片段，再寻找等距五线组。相邻两个谱表构成候选 piano system，收集贯穿上下谱表
的竖线，再合并相邻双小节线／终止线。所有阈值写在下方诊断代码中，以 PDF points 为单位，
因此尚不具备任意缩放、短行、非双谱表或断裂扫描线的泛化保证。

初次只找单条长横线时，score-4 每页仅得到两条页框线；实际谱线被分成逐小节短线。
按 y 合并片段解决这个输入表示问题，不是新增模型能力。

第一版按整页全部竖线 x 坐标做近邻聚类，再取均值，score-4 得到 37／32／17。
第二页 x=269.396 的小节线实际上由 y=63.146–115.847 与 115.647–136.047 两段组成，
能覆盖该 system；其他 system 的邻近符干把聚类中心移走，导致该线未被完整检验。
修正为先检验实际观测 x，再合并已通过覆盖检验的候选。其余阈值不变。

最小回归断言检查第二页第一个 system 是否保留 x=269.396：
旧版 exit 1，`AssertionError: existing barline x=269.396 was lost`；
新版同一断言 exit 0。三份 PDF 重跑后 score-4 变为 37／38／17，
K280 第三页由 15 变为 16；旧版失败未计为模型识别错误。

## 结果及视觉核对

| 输入／页面        | 每个 system 的几何区间数 | 总数   | 验证解释                                  |
| ----------------- | ------------------------ | ------ | ----------------------------------------- |
| score-4 p1        | 7,6,6,6,6,6              | 37     | 完整查看原谱，吻合                        |
| score-4 p2        | 7,7,6,6,6,6              | 38     | 完整查看原谱，吻合                        |
| score-4 p3        | 5,7,5                    | 17     | 完整查看原谱，吻合                        |
| score-9 p1        | 4,4,7,6                  | 21     | 实际 4,4,6,6，共 20；第三行首部误计 1     |
| K280 p1           | 5,3,3,3,3                | 17     | 仅自动提取，未逐小节视觉验收              |
| K280 p2           | 3,3,4,2,3,3              | 18     | 仅自动提取，未逐小节视觉验收              |
| K280 p3           | 3,3,3,3,2,2              | 16     | 仅自动提取，未逐小节视觉验收              |
| K280 p4           | 2,3,5,5,4,4              | 23     | 实际 2,3,4,5,4,4，共 22；第三行首部误计 1 |
| K280 p5           | 4,4,5,3,3,3              | 22     | 仅自动提取，未逐小节视觉验收              |
| K280 p6           | 3,3,3,3,3,3              | 18     | 仅自动提取，未逐小节视觉验收              |
| K280 p7           | 2,2,2,2,3,3              | 14     | 仅自动提取，未逐小节视觉验收              |
| K280 p8           | 3,2,3,2,2,2              | 14     | 仅自动提取，未逐小节视觉验收              |
| K280 p9           | 3                        | 3      | 仅自动提取，未逐小节视觉验收              |
| 扫描 4945954 p1–3 | 无向量五线组             | 不适用 | 不计作正确的零小节                        |

13 个向量页面均无剩余未分组的长横线，所有候选 system 左右边缘均覆盖。
但这两个检查没有发现行首反复记号误计，**不能作为正确性置信度或自动接受门槛**。

score-9 第三行的左边界约 x=28.75，起始反复记号约 x=57.97，两者之间是谱号区，不是一个小节。
K280 第四页第三行也有相同结构，起始反复记号约 x=62.8。
本轮没有用“首个窄区间一律删除”修补；窄小节、弱起、休止小节等尚未排除，硬删会引入新风险。

PDF 技能要求视觉核对，实际检查了 score-4 全三页、score-9 全页、K280 第四页及扫描第一页。
使用现有 LEGATO 环境的 PyMuPDF 渲染，无新增依赖。复用的 score-4 渲染在
`../development/legato-page-audit-v1-20260913/`，其余三个渲染在
`../development/legato-page-coverage-v1-20260913/`。其余 K280 页不是已验收样本。

## 下一步与停止线

1. 先解决**区域语义**：仅在明确识别行首起始反复记号时，合并其前的谱号区；有歧义则拒绝计数。
   验证必须包含没有起始反复记号的短首小节、全休止小节和普通行首，不能按宽度硬删。
2. 区域可靠之后，再验证**预测到图像的对应**。计数只负责发现数量差异，不能决定删除位置；
   不读取参考答案的音符／节奏视觉锚点仍是缺失环节。
3. 两道门均通过，才另立局部纠错实验；扫描识别需另行评估像素路径，不把向量能力包装成通用能力。

Decision boundaries:

- This diagnostic MUST NOT change recognition outputs, decoder defaults, or generation stopping rules.
- Missing vector staffs MUST be treated as unsupported, not as a zero-measure score.
- Correct counts MUST NOT be used as proof of prediction-to-image alignment.
- Any automatic correction proposal MUST first demonstrate semantic region validity and GT-free alignment.
- Development fixes MUST remain labeled as development evidence, not held-out validation.

## 复现：修正后的诊断代码

从仓库根目录，用既有 `/Users/hikerpig/.cache/zupulse/pdf-omr/legato-venv/bin/python` 执行下方代码。
仅打印 JSON，不写文件。输出保留每个 system 的全部 x/y 边界。
扫描检查仅将 root 替换为上述 4945954 目录，名称列表替换为 `['input']`。
这是一段保留失败边界的研究诊断，不是可复用的生产检测器。

```python
import fitz,json,hashlib
from pathlib import Path
root=Path('tools/pdf-omr-cli/reports/development/piano-recognition-v1-20260905')
def clusters(values,tol):
 out=[]
 for value in sorted(values):
  if out and value-out[-1][-1]<=tol: out[-1].append(value)
  else: out.append([value])
 return out
def merged(intervals,tol):
 out=[]
 for a,b in sorted(intervals):
  if out and a<=out[-1][1]+tol: out[-1][1]=max(out[-1][1],b)
  else: out.append([a,b])
 return out
for name in ['score-4','score-9','k280']:
 path=root/(name+'.pdf')
 print(json.dumps({'source':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}))
 for pi,page in enumerate(fitz.open(path)):
  lines=[item for drawing in page.get_drawings() for item in drawing['items'] if item[0]=='l']
  horizontal=[(p.y,min(p.x,q.x),max(p.x,q.x)) for _,p,q in lines if abs(p.y-q.y)<.2 and abs(p.x-q.x)>10 and 5<p.y<page.rect.height-5]
  rows=[]
  for group in clusters([h[0] for h in horizontal],.3):
   y=sum(group)/len(group)
   ranges=merged([(a,b) for yy,a,b in horizontal if abs(yy-y)<=.3],1)
   if ranges:
    a,b=max(ranges,key=lambda ab:ab[1]-ab[0])
    if b-a>=page.rect.width*.6: rows.append((y,a,b))
  staffs=[];i=0
  while i+4<len(rows):
   group=rows[i:i+5];gaps=[group[j+1][0]-group[j][0] for j in range(4)]
   if min(gaps)>=3 and max(gaps)<=8 and max(gaps)-min(gaps)<.3:
    staffs.append(group);i+=5
   else:i+=1
  vertical=[(p.x,min(p.y,q.y),max(p.y,q.y)) for _,p,q in lines if abs(p.x-q.x)<.2 and abs(p.y-q.y)>1]
  systems=[]
  if len(staffs)%2==0:
   for si in range(0,len(staffs),2):
    top,bottom=staffs[si],staffs[si+1];yt,yb=top[0][0],bottom[-1][0];gap=(top[-1][0]-yt)/4
    left=max(top[0][1],bottom[0][1]);right=min(top[0][2],bottom[0][2])
    candidates=[]
    # Test observed x positions before merging, so nearby stems cannot shift a barline hypothesis.
    for x in sorted(set(v[0] for v in vertical)):
     if x<left-1 or x>right+1:continue
     ranges=merged([(a,b) for xx,a,b in vertical if abs(xx-x)<=.8],.8)
     if any(a<=yt+.8 and b>=yb-.8 for a,b in ranges):candidates.append(x)
    boundaries=[sum(xs)/len(xs) for xs in clusters(candidates,gap*1.5)]
    systems.append({'y':[round(yt,2),round(yb,2)],'x':[round(x,2) for x in boundaries],'intervals':max(0,len(boundaries)-1),'edgeCoverage':bool(boundaries) and abs(boundaries[0]-left)<=gap*1.5 and abs(boundaries[-1]-right)<=gap*1.5})
  print(json.dumps({'page':pi+1,'horizontalRows':len(rows),'staffs':len(staffs),'unassignedRows':len(rows)-5*len(staffs),'systems':systems,'intervalTotal':sum(s['intervals'] for s in systems)}))
```

复现旧版：将实际 x 的循环替换成下方两行（其余内容不变）：

```python
for xs in clusters([v[0] for v in vertical], .8):
    x = sum(xs) / len(xs)
```

在逐页输出之前加入以下断言，即可复现同一个 RED/GREEN 回归检查。
断言的已观察坐标只用于检查提取器不丢已有线段，不提供小节数或识别答案。

```python
if name == "score-4" and pi == 1:
    assert any(abs(x - 269.396) < .8 for x in systems[0]["x"]), "existing barline x=269.396 was lost"
```

## 验证范围

- 实际提取：旧版最小回归 exit 1，新版回归 exit 0；新版 13 个向量页和 3 个扫描页均执行完成 exit 0。
- 几何验收：score-4 三页通过计数核对，score-9 与 K280 p4 的语义计数失败；扫描不适用。
- 新增推理／训练：0；没有运行 UI 或全仓代码测试，也没有声称生产行为通过验收。
- 四份输入 SHA-256 复核：4/4 未变。
- `pnpm check:docs`：exit 0；保留四条既有 Feature Contract 的 `last_verified` 超期提醒。
- `pnpm format:check`：exit 0，1078 个文件；`git diff --check`：exit 0。
- 已将本轮临时 plan/todo 的范围、结果及停止线提升到本文并移除临时文件；报告保留可复现代码。

## 后续增量：行首反复区域语义

本节记录同日的后续开发诊断。解决了上文两个已知误计，**仍未接入识别纠错**。
几何提取代码、模型输出和参考答案均未更改；只在第一个候选边界后确认非小节前缀。

### 依据和限制

score-9 使用 MScore，K280 使用 Leland；实际查看 PDF 并提取字符后，两者都以 U+E044 表示
观察到的反复圆点。规则同时要求：

- 贯穿双谱表的左粗右细双线，粗线宽至少是细线的 2 倍，间距为 0.6–1.5 个谱线间距。
- 细线右侧四个同 x 的已知字体圆点，分别位于两谱表的第 1.5、2.5 个谱线间距位置。
- 前缀存在两谱表的可读谱号，且只有当前明确支持的谱号／降号字符。
- 音符、休止符、未知字体／字符、缺失圆点、反向粗细线均不合并；不按区间宽度猜测。

这是**两个已观察字体上的 PDF 字符辅助判断**，不是扫描图像识别，也不是适用于任意音乐字体的
Unicode 语义保证。未知输入保留原始区间，不允许把不可读前缀当成“没有音符”。
保留原区间也不等于该区间已确认是小节；后续实现仍需显式表达不确定性。

### 两轮开发结果与反例

第一版通过 MScore 正例，但拒绝 K280 正例。追踪实际变量发现，Edwin-Italic 的小节编号末位
字符位于 x=28.693、y=300.472，进入了第一个 system 区域的上方边界检查；双线与四个圆点本身均通过。
新增测试复现后，只排除位于谱表上方超过一个谱线间距的 ASCII 数字，不读取或利用数字的值。
谱表内数字、未知音乐字形和音符仍保持否决，第二版通过两个真实正例。

| 版本 | classifier SHA-256                                                 | score-9 | K280 p4         |
| ---- | ------------------------------------------------------------------ | ------- | --------------- |
| v1   | `8685571ce584fb4d6f144e3b01e323f13bd588523f1732b0106dd34e1833b593` | 21→20   | 保留 23（拒绝） |
| v2   | `b73048dc036daab631ad2b8b5d4fdcc8df8d13cf91a9521c299be2cc709ae8f7` | 21→20   | 23→22           |

TDD 记录：初始 stub 的两个正例失败；实现 v1 后 3 个测试方法通过。
添加上方数字标注正例后 v1 再次失败；实现 v2 后 **4 个测试方法通过**，包含 3 个正例和
14 个否决子例。否决子例覆盖短前缀中出现音符／全休止／四分休止、未知字形／字体、
少一个圆点、左侧圆点、两条细线、终止反复方向、竖线未覆盖双谱表、无可读谱号、单线、
谱表上方的未知音乐字符和谱表内普通数字。

这些合成否决测试不等于真实弱起曲目的覆盖。真实控制包含 score-4 的全休止首小节以及所有普通行首；
没有为本轮新增一份未见弱起作品，不能宣称弱起泛化已经验收。

### 固定 v2 后的独立评价

提取子进程只读 PDF，完成后评价进程才打开参考 MXL，比较逐页、逐 system 的小节数。
没有根据参考结果修改 v2 或其阈值。

| 输入    | 逐页分类计数              | 与 MXL 分页／分行标记一致 |
| ------- | ------------------------- | ------------------------- |
| score-4 | 37,38,17                  | 3/3 页，15/15 system      |
| score-9 | 20                        | 1/1 页，4/4 system        |
| K280    | 17,18,16,22,22,18,14,14,3 | 9/9 页，48/48 system      |

合计 **13/13 页、67/67 system 的计数一致**。仅 score-9 第三行、K280 第四页第三行合并非小节前缀，
其余 65 个行首保持原计数。两处被接受的区域均已用完整页面渲染核对；K280 其余页面此轮为
MXL 分页标记核对，不冒充逐页视觉验收。三份输入 PDF hash 与上表不变。

评价参考 SHA-256：

- score-4.mxl：`aabdc2568b725b8141c297ccdbdcb03f77f52829811945d9dde53a28c0d228e1`
- score-9.mxl：`de7625743fbb22c230be08ed54dd7f06eb527f9752f29b933191099e837f38b6`
- k280.mxl：`f01652f7ca250b74dbb440ee92eaf5d8c3ea7874a2c862482e84e22bf8d59baf`

这是开发集上的区域计数结果；不是 67 个 system 的音符准确率，也不能证明所有边界都正确。
保留扫描输入不适用的结论；不推广默认值。

### 复现与保留证据

本地 harness：`../development/legato-repeat-region-v1-20260913/harness/`。
development 目录按仓库既有规则忽略；它们在当前工作区保留，不承诺干净 checkout 自动具有这些文件。
本节同时内嵌最终分类函数，几何原型仍为本文上面的代码块。

从仓库根目录运行：

```sh
rtk proxy /Users/hikerpig/.cache/zupulse/pdf-omr/legato-venv/bin/python tools/pdf-omr-cli/reports/development/legato-repeat-region-v1-20260913/harness/test_repeat_prefix.py
rtk proxy /Users/hikerpig/.cache/zupulse/pdf-omr/legato-venv/bin/python tools/pdf-omr-cli/reports/development/legato-repeat-region-v1-20260913/harness/audit.py
rtk proxy /Users/hikerpig/.cache/zupulse/pdf-omr/legato-venv/bin/python tools/pdf-omr-cli/reports/development/legato-repeat-region-v1-20260913/harness/evaluate_counts.py
```

三条命令实际均 exit 0。第一条验证局部判别规则，第二条打印 PDF-only 分类结果，第三条以独立进程
核对参考计数；不是一次端到端识别验收。`repeat_prefix_v1.py` 保留未处理上方数字时的拒绝结果。
test 文件 SHA-256 为 `63a9b54247c92c6fa14328a19bafdcb2470f69aaa0b9031c993a629f2ae9ead5`，
audit 文件为 `0781b5adcf1b6efb61060974f9aeacec030bff7bafe5fe432924135344c15fac`。

```python
def is_repeat_prefix(staff_tops, gap, left, candidate, segments, glyphs):
    if len(staff_tops) != 2 or gap <= 0:
        return False
    top, bottom = staff_tops[0], staff_tops[1] + 4 * gap

    def covers(x):
        cursor = top
        intervals = sorted((a, b) for xx, a, b, _ in segments if abs(xx - x) < 0.15)
        for a, b in intervals:
            if b < cursor - 0.8:
                continue
            if a > cursor + 0.8:
                break
            cursor = max(cursor, b)
        return cursor >= bottom - 0.8

    xs = sorted({x for x, _, _, _ in segments if abs(x - candidate) <= 1.5 * gap and covers(x)})
    if len(xs) != 2:
        return False
    thick, thin = xs
    widths = [max(w for x, a, b, w in segments if abs(x - xx) < 0.15 and b >= top and a <= bottom) for xx in xs]
    if not (0.6 * gap <= thin - thick <= 1.5 * gap and widths[0] >= 2 * widths[1] > 0):
        return False

    # These codepoints are visually verified only in the two fonts used by this pilot.
    fonts = {"MScore", "Leland"}
    dots = [(x, y) for font, char, x, y in glyphs if font in fonts and char == "\ue044" and thin + 0.2 * gap < x < thin + 1.5 * gap and top <= y <= bottom]
    if len(dots) != 4 or max(x for x, _ in dots) - min(x for x, _ in dots) > 0.2 * gap:
        return False
    if not all(sum(abs(y - (staff + offset * gap)) < 0.15 * gap for _, y in dots) == 1 for staff in staff_tops for offset in [1.5, 2.5]):
        return False

    # Absence of notes is not enough: unreadable prefixes must not become permission to discard a region.
    prefix = [(font, char, x, y) for font, char, x, y in glyphs if left < x < thick - 0.2 * gap and top - 3 * gap < y < bottom + 3 * gap]
    # Above-staff decimal labels are annotations; their numeric value is never used for counting.
    prefix = [g for g in prefix if not (g[1] in "0123456789" and g[3] < top - gap)]
    allowed = {"\ue050", "\ue062", "\ue260"}
    if not prefix or any(font not in fonts or char not in allowed for font, char, _, _ in prefix):
        return False
    return all(any(char in {"\ue050", "\ue062"} and staff - gap <= y <= staff + 5 * gap for _, char, _, y in prefix) for staff in staff_tops)
```

### 下一轮决定

区域计数的两个已知反例已解决，停止继续围绕同一组页面微调分类阈值。下一轮进入
**GT-free prediction-to-region alignment**：复用固定区域，检查输入音乐字符是否提供足够的
音符位置／音高锚点，将既有 LEGATO 输出映射到图像区域；先只输出对应关系及歧义，不删改音符。

任何后续纠错仍须证明恢复数、损失的原正确事件、整曲结构与跨作品回归；本轮没有新增音符识别收益。
本增量按 incremental-implementation 与 TDD 分阶段验证；PDF 技能提供两处正例的视觉依据，
systematic-debugging 定位了数字标注污染。没有把技能要求转化成新评测平台。
