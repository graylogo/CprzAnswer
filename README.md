# cprz 本地题库答题系统

把 hbjcrz.com 题库（题目、选项、解析、全站错误率、线上作答记录）爬到本地，离线答题、统计正确率，并支持与 `caishi.js` 油猴脚本完全一致的「带颜色富文本」复制格式。

## 使用方法

```bash
# 需要 Node 18+（零依赖）
node server.js
```

打开 http://localhost:8899 ，点击「开始爬取」即可（默认 cat_id=18，共 813 题）。

## 快速开始

```bash
git clone git@github.com:graylogo/CprzAnswer.git
cd CprzAnswer
cp config.example.json config.json   # 填入你的 token
node server.js
```

登录态说明：登录网站后，从浏览器请求头中复制 `token` 的值，填入 `config.json`：

```json
{
  "cat_id": 18,
  "token": "粘贴 token（如 ffe3b484-…）"
}
```

重启 `node server.js` 再爬取。`token` 字段也兼容填完整 Cookie。

## 功能

- 爬取：`/api/question/list` 全部分页 + `/api/question/answer_sheet` 答题卡 + `/api/note/index` 每题笔记/全站错误率，保存到 `data/bank.json`
- 答题：单选点击即提交，多选勾选后 Enter/按钮确认；答完显示对错、正确答案、参考解析、我的笔记、全站错误率
- 统计：本地正确率实时统计；可一键导入线上作答记录
- 复制：与 caishi.js 相同格式（`【单选】` 题干 / 选项 / `正确答案：X。您的答案：Y` / 解析），正确选项绿色、错选字母红色，纯文本兜底
- 筛选：全部 / 未作答 / 答错 / 答对，答题卡格子点击跳题
- 快捷键：`B` 上一题、`N` 下一题、右键下一题、`A-D` 选答案、`Enter` 确认多选
- 进度保存在浏览器 localStorage，刷新不丢失

## 部署到互联网（纯静态，免费）

题库可打包为纯静态站点（数据内嵌 `data.js`，无需任何后端），答题进度保存在浏览器 localStorage，刷新/重开浏览器都不丢失：

```bash
node build_static.js   # 生成 dist/ 目录
```

把 `dist/` 部署到任意静态托管即可。推荐（都免费、免运维）：

| 服务 | 方式 | 特点 |
|---|---|---|
| **Netlify Drop** | 打开 app.netlify.com/drop，把 `dist` 文件夹拖进去 | 最简单，30 秒上线，无需注册即可先预览 |
| **Cloudflare Pages** | Dashboard 上传或连接 Git 仓库 | 速度快，国内访问相对友好 |
| **GitHub Pages** | push 到仓库后开启 Pages | 需仓库公开（注意题库版权，建议私有方案） |
| **Vercel** | `npx vercel dist` 或连接 Git | 简单，免费额度充足 |

更新题库：重新运行 `node server.js` 爬取（token 过期先更新 `config.json`），再 `node build_static.js`，重新上传 `dist/` 即可。注意：进度存在浏览器里，与域名绑定，换域名后旧进度不迁移。

## 文件结构

```
server.js          # 零依赖 Node 服务：爬取 + API + 静态页面
config.json        # cat_id 与 token 配置
public/            # 答题页面（本地版与静态版共用）
build_static.js    # 生成纯静态站点到 dist/
dist/              # 可直接托管的静态站点（自动生成）
data/bank.json     # 爬取到的题库（自动生成）
doc/               # 接口样例数据
```
