// ==================== Supabase 配置 ====================
// ⚠️ 部署前请替换为您的 Supabase 项目配置

// 1. 替换为您的 Supabase 项目 URL（格式：https://xxxxx.supabase.co）
const SUPABASE_URL = 'https://xinqzxrulxtermoifija.supabase.co';

// 2. 替换为您的 anon public key（在 Project Settings → API 中获取）
const SUPABASE_ANON_KEY = 'xinqzxrulxtermoifija';

// 3. 创建 Supabase 客户端（使用全局 supabase 命名空间，避免重复声明）
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 4. 全局配置
const DEFAULT_ADMIN = {
    username: 'admin',
    password: 'admin123'
};

const TARGET_SCORE = 2026;

// 5. 工具函数
function formatDate(dateString) {
    if (!dateString) return '-';
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
    if (type === 'error') {
        alert('❌ ' + message);
    } else {
        alert('✅ ' + message);
    }
}

// 6. 检查 Supabase 是否就绪
function isSupabaseReady() {
    return supabaseClient !== null && typeof supabaseClient.from === 'function';
}

// 7. 初始化检查
if (isSupabaseReady()) {
    console.log('✅ Supabase 客户端初始化成功');
} else {
    console.error('❌ Supabase 初始化失败');
    alert('数据库配置错误！请检查 config.js 中的 SUPABASE_URL 和 SUPABASE_ANON_KEY');
}
