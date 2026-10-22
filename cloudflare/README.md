# Cloudflare 部署：Workers + D1 + 私有 R2

这是本次二次开发新增的部署方式。账号、社区和生活记录保存在 D1；新社区视频、图片、饮食照片和用户配乐存放在私有 R2。原版 Node/Docker 部署仍可使用，两个实现的部分管理和原生 App 接口支持范围不同。

仓库中的 `wrangler.jsonc` 是公开模板，**没有作者的账号 ID、数据库 ID 或密钥**。必须先替换为自己的资源和域名，不能直接指向体验站。

## 1. 安装依赖

推荐 Node.js 22.12+。在仓库根目录执行：

```sh
npm --prefix frontend ci --ignore-scripts
npm --prefix api ci --omit=optional
npm --prefix cloudflare ci --ignore-scripts
cd cloudflare
npx wrangler login
```

## 2. 创建资源并修改配置

```sh
npx wrangler d1 create opengym
npx wrangler r2 bucket create opengym-media
```

将 D1 输出的真实 `database_id` 写入 `wrangler.jsonc`，并核对数据库名与桶名。配置自己的自定义域名：

- `routes[0].pattern`：例如 `gym.example.com`，该域名需要在自己的 Cloudflare 账号中可配置。
- `vars.ORIGIN`：`https://gym.example.com`，不带结尾斜杠。
- `vars.RP_ID`：`gym.example.com`，不带协议或路径。
- `name`：自己的 Worker 名称。
- 默认 `MEDIA_STORE=r2`；个人配额 1024 MiB，站点配额 8192 MiB。源码和迁移中的限制需要一起评估，不能只改一项就认为完成扩容。

桶保持私有，不启用公开 `r2.dev`。在 R2 生命周期中设置未完成的分片上传 1 天后清理。应用每小时也会尝试回收过期上传和配额预留。

## 3. 迁移数据库与设置 Secret

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put BOOTSTRAP_CODE
# 需要 AI 饮食/训练计划功能时再配置：
npx wrangler secret put FOOD_AI_API_KEY
```

`BOOTSTRAP_CODE` 是自己选择的高强度首次注册码。由本人在最终 HTTPS 域名完成第一位管理员的通行密钥注册；数据库已有用户后，这个码不能继续创建管理员。不要把实际值写进 `vars`、文档或 Git。普通新用户通过管理员生成的独立邀请码加入，默认每码 10 人，可单独提升至 100 人，没有时间过期限制，满额或撤销后不可继续注册。

AI 服务地址和模型可通过 `FOOD_AI_BASE_URL`、`FOOD_AI_MODEL` 配置，但需要确认所选模型支持对应的输入方式。`FOOD_AI_API_KEY` 只由服务端读取。未配置时仍可手动记录和管理计划。

## 4. 构建与发布

```sh
npm run deploy
```

该命令构建前端、复制上游授权动作素材、运行部署检查和 Wrangler dry-run，再发布 Worker。**修改配置后再发布**；占位数据库 ID 会被检查拒绝。请保留 Gym visual 的授权声明。

首次只对自己开放访问，创建管理员并确认邀请制、登录、同步和素材权限正常后，再邀请朋友。不要在临时域名注册正式通行密钥后才改域名。

## 支持范围

- 通行密钥注册、登录、添加设备与退出全部设备；昵称＋密码注册和登录，原账号可通过本人验证设置密码。
- 密码仅保存随机盐和派生值，启用持久化登录限流；变更密码使旧会话失效，管理员可为已有密码账号发放一次性重置码。
- 训练记录和计划同步，包含版本冲突检查；饮食、AI 计划助手、个人资料、邀请制社区、互关私信和消息中心。
- 新素材：视频 200 MiB、照片 20 MiB、MP3 2 MiB；视频分片默认 5 MiB，每次最多并行 2 片，校验和配额预留，支持 24 小时内重选同一文件续传。
- 视频和音乐支持 HEAD／Range。不会在 Worker 中把整个大视频读入内存；没有通用服务端转码，推荐 MP4/H.264/AAC。
- 旧训练附件通道仍为每文件 2 MiB、每用户 20 MiB、全站 100 MiB；与新的社区 R2 通道区分。旧 D1 媒体保留，且计入新总配额。
- R2 素材必须通过登录与动态可见性校验读取，不是公开文件托管。
- 暂未接入上游原生 App 配对、系统推送、上游 AI 教练和部分管理员审计／账号删除接口；密码重置仅支持已有密码的账号，不以管理员重置码替代首次通行密钥本人验证。

## 费用与备份

Workers 可以采用免费计划，D1 和 R2 各有免费额度。**R2 超额和第三方 AI 可能收费**；应用配额不是 Cloudflare 账单上限。请在自己的账号查看用量及账单，并设置适合自己的预算提醒。

```sh
npx wrangler d1 export DB --remote --output /你的安全备份目录/opengym.sql
```

D1 导出包含私人记录、认证元数据和 R2 引用，**不包含 R2 文件本身**；R2 对象需要另行备份并保留对象键。备份不要提交 Git。恢复应先在独立环境验证，不要用正式库测试覆盖恢复。

## 本地集成测试

```sh
npm test
```

测试自动生成本地配置并创建临时 D1、R2 和虚构账号，不需要正式 API 密钥。请先构建前端以生成 `frontend/dist/index.html`。测试覆盖通行密钥、密码、邀请码、同步、隐私、私信、消息已读快照及分片上传等；部分 R2 边界测试会传输 200 MiB 测试数据，需预留内存、磁盘和本地端口。
