// ==================== 全局变量 ====================
let currentUser = null;
let participants = [];
let pendingDeleteId = null;

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    // 检查 Supabase 是否就绪
    if (!window.sesameUtils.isSupabaseReady()) {
        alert('❌ 数据库未连接！请检查 config.js 配置');
        return;
    }
    
    // 检查登录状态
    checkLoginStatus();
    
    // 加载参与者列表
    await loadParticipants();
    
    // 回车键提交
    document.getElementById('nameInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('scoreInput').focus();
    });
    
    document.getElementById('scoreInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addParticipant();
    });
});

// ==================== 认证功能 ====================
function checkLoginStatus() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('userStatus').textContent = `👤 ${currentUser.username}`;
    }
}

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'flex';
}

function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
}

async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showError('请输入用户名和密码');
        return;
    }
    
    // 使用全局配置
    const adminConfig = window.SESAME_CONFIG.DEFAULT_ADMIN;
    if (username === adminConfig.username && password === adminConfig.password) {
        currentUser = { username, role: 'admin' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        document.getElementById('userStatus').textContent = `👤 ${username}`;
        closeLoginModal();
        window.sesameUtils.showToast('登录成功！');
        
        if (window.location.pathname.includes('admin.html')) {
            location.reload();
        }
    } else {
        showError('用户名或密码错误');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

function showError(message) {
    const errorEl = document.getElementById('loginError') || document.getElementById('deleteError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 3000);
    }
}

// ==================== 参与者管理 ====================
async function loadParticipants() {
    try {
        // 使用修复后的客户端
        const { data, error } = await window.sesameSupabase
            .from('participants')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        participants = data || [];
        renderParticipants();
        updateCount();
    } catch (error) {
        console.error('加载参与者失败:', error);
        window.sesameUtils.showToast('加载数据失败，请检查网络连接或数据库配置', 'error');
    }
}

async function addParticipant() {
    const nameInput = document.getElementById('nameInput');
    const scoreInput = document.getElementById('scoreInput');
    
    const name = nameInput.value.trim();
    const score = parseInt(scoreInput.value);
    
    if (!name) {
        window.sesameUtils.showToast('请输入姓名或昵称', 'error');
        return;
    }
    
    if (isNaN(score) || score < 350 || score > 950) {
        window.sesameUtils.showToast('芝麻分必须在350-950之间', 'error');
        return;
    }
    
    try {
        const participantId = 'P' + String(Date.now()).slice(-6);
        
        const { error } = await window.sesameSupabase
            .from('participants')
            .insert([{
                id: participantId,
                name: name,
                score: score,
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        nameInput.value = '';
        scoreInput.value = '';
        
        await loadParticipants();
        
        window.sesameUtils.showToast(`✅ ${name} (${participantId}) 已添加`);
    } catch (error) {
        console.error('添加参与者失败:', error);
        window.sesameUtils.showToast('添加失败：' + (error.message || '请检查数据库配置'), 'error');
    }
}

// ... 其余函数保持不变，只需将所有 supabase 替换为 window.sesameSupabase
// 例如：在 confirmDelete, matchTeams 等函数中

function openDeleteModal(id, name, score) {
    pendingDeleteId = id;
    document.getElementById('deleteTargetInfo').innerHTML = 
        `参与者: <strong>${name}</strong> (${score}分)`;
    // ... 其余代码不变
}

// ... 其他函数（renderParticipants, updateCount 等）保持不变
