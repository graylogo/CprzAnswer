# cprz 本地题库答题系统

把 hbjcrz.com 题库（题目、选项、解析、全站错误率、线上作答记录）爬到本地，离线答题、统计正确率，并支持与 `caishi.js` 油猴脚本完全一致的「带颜色富文本」复制格式。

**在线使用：<https://cprzanswer.netlify.app>**

## 快速开始

### 直接使用（推荐）

打开 <https://cprzanswer.netlify.app> 即可在线答题，进度自动保存在浏览器本地（localStorage），刷新/重开浏览器都不丢失。

### 本地运行

```bash
git clone git@github.com:graylogo/CprzAnswer.git
cd CprzAnswer
node server.js        # 需要 Node 18+（零依赖）
```

打开 http://localhost:8899 ，点击「开始爬取」即可（默认 cat_id=18）。

登录态说明：登录网站后，从浏览器请求头中复制 `token` 的值，填入 `config.json`（模板见 `config.example.json`）：

```json
{
  "cat_id": 18,
  "token": "粘贴你的 token"
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

## 自动部署（Netlify）

本仓库已连接 Netlify，`git push` 到 `main` 分支后自动构建上线：

- 构建命令：`node build_static.js`
- 发布目录：`dist`

```bash
git add . && git commit -m "更新题库" && git push
# Netlify 自动重新构建并部署到 https://cprzanswer.netlify.app
```

## 更新题库

重新运行 `node server.js` 爬取（token 过期先更新 `config.json`），提交 `data/bank.json` 后 push，Netlify 会自动用最新数据构建上线。

注意：进度存在浏览器里，与域名绑定，换域名后旧进度不迁移。

## 其他部署方式

`node build_static.js` 生成纯静态站点（数据内嵌 `data.js`，无需后端），`dist/` 可部署到任意静态托管：

| 服务 | 方式 | 特点 |
|---|---|---|
| **Netlify** | 连接 Git 仓库自动部署（本项目在用） | push 即上线 |
| **Cloudflare Pages** | Dashboard 上传或连接 Git 仓库 | 速度快，国内访问相对友好 |
| **GitHub Pages** | push 到仓库后开启 Pages | 需仓库公开（注意题库版权，建议私有方案） |
| **Vercel** | `npx vercel dist` 或连接 Git | 简单，免费额度充足 |

## 文件结构

```
server.js          # 零依赖 Node 服务：爬取 + API + 静态页面
config.example.json# 配置模板（cat_id 与 token）
public/            # 答题页面（本地版与静态版共用）
build_static.js    # 生成纯静态站点到 dist/
dist/              # 可直接托管的静态站点（自动生成）
data/bank.json     # 爬取到的题库
doc/               # 接口样例数据
```
