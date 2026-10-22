# openGym · 我的健身记录

基于 [DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym) 的个人中文版。
支持自己的 HTTPS 站点和手机浏览器；通行密钥不可用时可选择已启用的密码登录。完整新增功能和演示见 [主 README](README.md)。

## 新增头像、饮食与好友社区

已增加个人头像与资料、拍照饮食记录、DeepSeek 真实图片识别、日周月年热量统计，以及邀请制好友动态流。详见 [使用说明和验收记录](README.md)。

## 当前版本

- 首次打开默认简体中文，语言包加载后再显示界面，避免闪现英文。
- 沿用上游 2,258 条中文界面文案和 5,632 个中文动作名。
- 新建档案默认不在动作名称后附加英文；设置中仍可开启。
- 新建入门计划使用中文训练日名称，不改写已有或导入的计划名称。
- 目前有 1,324 个动作具备中文步骤。其余动作明确提示中文步骤尚缺，英文原文可手动展开；动作简介原文同样折叠保留。没有把未翻译内容标成已完成翻译。
- 修正配重提示中把重量误译成“次数”的问题；调整手机首页下次训练提示的字号和换行。
- 保留原项目训练记录、体重、统计、备份导入导出和服务器同步功能。

原始源码基线：`e348fc17c42c7e9a211c5972e573ad3698190ee2`，前端版本 `1.4.1`。

## 本地预览

使用 Node.js 22.12+，或其他满足当前 Vite 要求的版本。首次安装：

```sh
cd frontend
npm ci --ignore-scripts
cd ../api
npm ci --omit=optional
cd ..
npm run dev:zh
```

打开 <http://localhost:13000>。入口只监听本机，不是公网地址。
端口占用时可以运行 `GYM_DEV_PORT=13010 GYM_API_PORT=13011 npm run dev:zh`。
退出时按 Ctrl+C，前后端一起停止。

本地登录档案的数据在 `.local-data/`，正式 Docker 部署的数据在 `data/`。
“不用账号继续”的记录仅保存在当前浏览器，不能跨设备同步。浏览器中加载的推拉腿计划仅用于体验，可自行修改；没有预置已完成训练或体重记录。

## 部署自己的服务器

以下配置部署完整前后端，不能只上传 `frontend/dist` 获得完整账号和同步功能。
使用 Docker Compose，从此修改版源码构建，不拉取上游原版网页镜像。

### 1. 启动本机检查

```sh
cp .env.zh.example .env.zh
docker compose --env-file .env.zh -f compose.zh.yml up -d --build
```

默认只开放服务器本机的 `127.0.0.1:8080`。如果在远程服务器操作，先使用 SSH 隧道：

```sh
ssh -L 8080:127.0.0.1:8080 你的服务器用户@你的服务器地址
```

电脑浏览器打开 `http://localhost:8080` 检查中文登录页即可。正式档案等域名配置好后再创建，以免通行密钥绑定到临时的 localhost 地址。部署版不提供访客入口。

### 2. 配置域名和 HTTPS

把域名解析到服务器，确保 80/443 端口可达。将 `.env.zh` 改为：

```dotenv
GYM_DOMAIN=你的实际域名
RP_ID=你的实际域名
ORIGIN=https://你的实际域名
DEFAULT_LANG=zh
INVITE_ONLY=0
```

`RP_ID` 不带协议或路径，`ORIGIN` 不加末尾斜杠。通行密钥绑定到域名，建议一开始就使用计划长期保留的域名。

首次上线期间，通过服务器防火墙或已有代理的访问控制把站点限制为自己可访问；在正式 HTTPS 地址创建自己的档案（首个档案成为管理员），随后把 `INVITE_ONLY=1`，重新执行部署命令，再开放日常访问。后续新增账号使用管理员生成的邀请代码。

启动自带 Caddy，自动申请证书：

```sh
docker compose --env-file .env.zh -f compose.zh.yml --profile public up -d --build
```

已有 nginx/Caddy 时可以不启动 `public` 配置，只把自己的代理指向本机 8080；同样需要 HTTPS。

### 3. 在 iPhone 使用

1. 用 Safari 打开 `https://你的实际域名`。
2. 创建/登录正式档案，确认训练记录可保存。
3. Safari 分享菜单 → 添加到主屏幕，名称为“健身记录”。
4. 从桌面图标打开使用。

HTTPS 是手机通行密钥、Service Worker 和安装后离线体验的前提。本地 HTTP 预览不能代替真实 iPhone 的 HTTPS 验收。

### 4. 备份

定期保存整个 `data/` 目录到另一处；里面包含账号、训练记录、上传素材和会话签名文件。应用的“设置 → 数据与备份”也可导出个人数据。不要公开上传数据目录或备份。

## 验证状态

见 [中文版本验收记录](docs/PUBLICATION.md)。当前提供本地版本与已部署的 Cloudflare 版本；Docker 构建运行、iPhone 真机安装、Face ID 登录和 HTTPS 离线同步仍需在目标环境继续验收。

## 授权

保留上游 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。代码采用 AGPL，修改版作为网络服务提供时应提供对应源码。动作演示素材不属于 AGPL；目前保留在非商业 openGym fork 内并保留原版权说明。商业使用须另行处理素材授权。


## Cloudflare 免费部署版

正式站点：https://opengym.xiaolinyx.me 。采用 Workers＋D1＋私有 R2，社区单视频最多200 MiB，素材每人1 GiB、本站8 GiB；R2超出账户免费额度按量计费，未升级Workers套餐。首次注册、限制、测试与迁移说明见 [Cloudflare 部署说明](cloudflare/README.md)。本机原站点与正式站点数据独立，未自动迁移。

## 视频响应与 AI 计划

支持十人邀请码、首次登录引导、私人身体资料与 BMI 参考，以及“计划 → AI辅助制定训练计划”的提问、图像参考、编辑和一键应用。视频播放修复、新上传 MP4 的无损提前读取、隐私及验证边界见 [本轮验收记录](docs/PUBLICATION.md)。AI 沿用服务端 DeepSeek 配置，单账号每日最多5次；可选图片经本人确认后发送第三方，不保存到社区。
