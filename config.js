// ==================== Supabase 配置 ====================
// ⚠️ 部署前请替换为您的 Supabase 项目配置

const SUPABASE_URL = 'https://xinqzxrulxtermoifija.supabase.co';
const SUPABASE_ANON_KEY = 'xinqzxrulxtermoifija';

// 初始化 Supabase 客户端
const supabase = supabase.create({
    url: SUPABASE_URL,
    key: SUPABASE_ANON_KEY
});

// 默认管理员账号（生产环境建议改为数据库存储）
const DEFAULT_ADMIN = {
    username: 'admin',
    password: 'admin123'
};

// ==================== 工具函数 ====================
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(message, type = 'success') {
    // 简单的提示（可以用 alert 或更复杂的 Toast 组件）
    if (type === 'error') {
        alert('❌ ' + message);
    } else {
        alert('✅ ' + message);
    }
}
