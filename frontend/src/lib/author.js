// Replace the group image and expiry together when renewing the WeChat invitation.
export const COMMUNITY_QR_EXPIRES = '2026-11-01T00:00:00+08:00'
export const communityQRActive = (now = new Date()) => now.getTime() < new Date(COMMUNITY_QR_EXPIRES).getTime()
export function timeGreeting(date = new Date()) {
 const hour = date.getHours()
 return hour < 5 || hour >= 23 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
}
export const updates = [
 {date:'2026-10-25', title:'细节打磨，记录也可以更有质感', items:['修复手机个人主页头像被压成椭圆的问题，统一头像与图片比例。','认识作者加入纸飞机图标和轻微互动，更新作者介绍。','首页、个人主页与作者页改用更细的边线和轻阴影，整理个人功能栏与标签页；兼容浅色、深色和减少动态效果偏好。']},
 {date:'2026-10-25', title:'认识作者，一起完善 OpenGym', items:['首页按时间问候，日常数据保存状态仅对管理员展示；保存异常仍可查看。','新增作者介绍、联系方式、共建群和投稿信箱，后台可辨认反馈来源。','新账号欢迎引导加入共建邀请，更新日志集中展示迭代进展。']},
 {date:'2026-10-25', title:'让日常记录与每周回顾更清晰', items:['首页训练与健身打卡并排，照片或地点即可打卡；开始训练先预览，再确认计时。','热力图统一格子大小，体重入口更明显，并支持不同时间范围查看趋势。','周报新增训练、饮食和体重图表，可导出图片与文本；AI 编排由用户主动选择。','饮食分为今日记录、饮食计划、食物库和趋势，日常记录优先。']},
]
