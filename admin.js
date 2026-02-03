// ==================== 管理员后台 JavaScript ====================

let currentUser = null;
let participants = [];
let auditLogs = [];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    // 检查登录状态
    checkAdminLoginStatus();
    
    // 如果未登录，显示登录按钮
    updateLoginButtons();
    
    // 检查 Supabase 是否就绪
    if (!isSupabaseReady()) {
        alert('❌ 数据库未连接！请检查 config.js 配置');
        return;
    }
    
    // 如果已登录，加载所有数据
    if (checkAdminLogin()) {
        await Promise.all([
            loadParticipants(),
            loadAuditLogs(),
            updateStats()
        ]);
        
        // 每30秒自动刷新数据
        setInterval(async () => {
            await loadParticipants();
            await loadAuditLogs();
            updateStats();
        }, 30000);
    }
});

// ==================== 登录功能 ====================
function checkAdminLoginStatus() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
    }
}

function updateLoginButtons() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userStatus = document.getElementById('adminUserStatus');
    
    if (currentUser && currentUser.role === 'admin') {
        // 已登录状态
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        userStatus.textContent = `👤 ${currentUser.username} (管理员)`;
    } else {
        // 未登录状态
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        userStatus.textContent = '👤 未登录';
    }
}

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'flex';
}

function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
}

async function adminLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showError('请输入用户名和密码');
        return;
    }
    
    // 验证管理员账号
    if (username === DEFAULT_ADMIN.username && password === DEFAULT_ADMIN.password) {
        currentUser = { username, role: 'admin' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // 更新UI
        updateLoginButtons();
        closeLoginModal();
        
        // 清空登录表单
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
        
        // 显示成功提示
        showToast('登录成功！');
        
        // 加载数据
        await Promise.all([
            loadParticipants(),
            loadAuditLogs(),
            updateStats()
        ]);
        
        // 启动自动刷新
        setInterval(async () => {
            await loadParticipants();
            await loadAuditLogs();
            updateStats();
        }, 30000);
    } else {
        showError('用户名或密码错误');
    }
}

function logout() {
    if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('currentUser');
        currentUser = null;
        updateLoginButtons();
        showToast('已退出登录');
        
        // 清空数据展示
        document.getElementById('totalParticipants').textContent = '0';
        document.getElementById('totalCombinations').textContent = '0';
        document.getElementById('totalDeleted').textContent = '0';
        document.getElementById('totalUsers').textContent = '0';
        
        // 清空表格
        document.getElementById('participantsTableBody').innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <div style="font-size: 2rem; margin-bottom: 15px;">👥</div>
                    <p>暂无参与者数据</p>
                </td>
            </tr>
        `;
        
        document.getElementById('auditLogTableBody').innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 40px;">
                    <div style="font-size: 2rem; margin-bottom: 15px;">📝</div>
                    <p>暂无删除记录</p>
                </td>
            </tr>
        `;
    }
}

function showError(message) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 3000);
    }
}

// ==================== 认证功能 ====================
function checkAdminLogin() {
    const savedUser = localStorage.getItem('currentUser');
    if (!savedUser) {
        return false;
    }
    
    currentUser = JSON.parse(savedUser);
    return currentUser.role === 'admin';
}

function updateAdminUserStatus() {
    const statusEl = document.getElementById('adminUserStatus');
    if (statusEl && currentUser) {
        statusEl.textContent = `👤 ${currentUser.username} (管理员)`;
    }
}

// ==================== 数据加载 ====================
async function loadParticipants() {
    try {
        const { data, error } = await supabaseClient
            .from('participants')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        participants = data || [];
        renderParticipantsTable();
    } catch (error) {
        console.error('加载参与者失败:', error);
        showToast('加载参与者数据失败', 'error');
    }
}

async function loadAuditLogs() {
    try {
        const { data, error } = await supabaseClient
            .from('audit_log')
            .select('*')
            .order('deleted_at', { ascending: false });
        
        if (error) throw error;
        
        auditLogs = data || [];
        renderAuditLogTable();
    } catch (error) {
        console.error('加载审计日志失败:', error);
        showToast('加载审计日志失败', 'error');
    }
}

// ==================== 统计更新 ====================
async function updateStats() {
    try {
        // 总参与者数
        const participantCount = participants.length;
        document.getElementById('totalParticipants').textContent = participantCount;
        
        // 有效组合数（需要重新计算）
        const combinations = findAllPerfectCombinations(participants, TARGET_SCORE);
        document.getElementById('totalCombinations').textContent = combinations.length;
        
        // 已删除记录数
        document.getElementById('totalDeleted').textContent = auditLogs.length;
        
        // 注册用户数（这里简单显示1，实际可根据需要扩展）
        document.getElementById('totalUsers').textContent = '1';
        
        // 数据库状态
        const dbStatusEl = document.getElementById('dbStatus');
        if (dbStatusEl) {
            dbStatusEl.className = 'status-badge status-success';
            dbStatusEl.textContent = '✅ 连接正常';
        }
    } catch (error) {
        console.error('更新统计失败:', error);
        const dbStatusEl = document.getElementById('dbStatus');
        if (dbStatusEl) {
            dbStatusEl.className = 'status-badge status-error';
            dbStatusEl.textContent = '❌ 连接异常';
        }
    }
}

// ==================== 表格渲染 ====================
function renderParticipantsTable() {
    const tbody = document.getElementById('participantsTableBody');
    
    if (participants.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <div style="font-size: 2rem; margin-bottom: 15px;">👥</div>
                    <p>暂无参与者数据</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = participants.map(p => `
        <tr>
            <td><input type="checkbox" class="select-checkbox" data-id="${p.id}"></td>
            <td>${p.id}</td>
            <td>${p.name}</td>
            <td>${p.score}</td>
            <td>${formatDate(p.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteParticipant('${p.id}', '${p.name}')">
                    删除
                </button>
            </td>
        </tr>
    `).join('');
}

function renderAuditLogTable() {
    const tbody = document.getElementById('auditLogTableBody');
    
    if (auditLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 40px;">
                    <div style="font-size: 2rem; margin-bottom: 15px;">📝</div>
                    <p>暂无删除记录</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = auditLogs.map(log => `
        <tr>
            <td>${log.participant_id}</td>
            <td>${log.participant_name}</td>
            <td>${log.delete_reason}</td>
            <td>${formatDate(log.deleted_at)}</td>
        </tr>
    `).join('');
}

// ==================== 操作功能 ====================
function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.select-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
}

async function deleteParticipant(id, name) {
    if (!confirm(`确定要删除参与者 ${name} 吗？`)) {
        return;
    }
    
    const reason = prompt('请输入删除原因（只能输入"已组队成功"才能删除）：');
    
    // 验证删除原因 - 只有"已组队成功"才允许删除
    if (reason !== '已组队成功') {
        alert('❌ 删除失败：只有输入"已组队成功"才能删除参与者');
        return;
    }
    
    if (!reason || reason.trim().length < 5) {
        alert('删除原因至少需要5个字！');
        return;
    }
    
    try {
        // 记录审计日志
        const participant = participants.find(p => p.id === id);
        if (!participant) {
            throw new Error('未找到该参与者');
        }
        
        await supabaseClient.from('audit_log').insert([{
            participant_id: participant.id,
            participant_name: participant.name,
            participant_score: participant.score,
            delete_reason: reason.trim(),
            deleted_at: new Date().toISOString()
        }]);
        
        // 删除参与者
        const { error } = await supabaseClient
            .from('participants')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showToast(`✅ ${name} 已删除`);
        
        // 重新加载数据
        await Promise.all([
            loadParticipants(),
            loadAuditLogs(),
            updateStats()
        ]);
    } catch (error) {
        console.error('删除失败:', error);
        showToast('删除失败: ' + (error.message || '请重试'), 'error');
    }
}

async function bulkDelete() {
    const selectedCheckboxes = document.querySelectorAll('.select-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('请先选择要删除的参与者！');
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${selectedCheckboxes.length} 个参与者吗？`)) {
        return;
    }
    
    const reason = prompt('请输入删除原因（只能输入"已组队成功"才能删除）：');
    
    // 验证删除原因 - 只有"已组队成功"才允许删除
    if (reason !== '已组队成功') {
        alert('❌ 删除失败：只有输入"已组队成功"才能删除参与者');
        return;
    }
    
    if (!reason || reason.trim().length < 5) {
        alert('删除原因至少需要5个字！');
        return;
    }
    
    try {
        let successCount = 0;
        let failCount = 0;
        
        for (const checkbox of selectedCheckboxes) {
            const id = checkbox.dataset.id;
            const participant = participants.find(p => p.id === id);
            
            if (!participant) continue;
            
            try {
                // 记录审计日志
                await supabaseClient.from('audit_log').insert([{
                    participant_id: participant.id,
                    participant_name: participant.name,
                    participant_score: participant.score,
                    delete_reason: reason.trim(),
                    deleted_at: new Date().toISOString()
                }]);
                
                // 删除参与者
                await supabaseClient
                    .from('participants')
                    .delete()
                    .eq('id', id);
                
                successCount++;
            } catch (error) {
                console.error(`删除 ${id} 失败:`, error);
                failCount++;
            }
        }
        
        showToast(`✅ 成功删除 ${successCount} 个参与者${failCount > 0 ? `，失败 ${failCount} 个` : ''}`);
        
        // 重新加载数据
        await Promise.all([
            loadParticipants(),
            loadAuditLogs(),
            updateStats()
        ]);
        
        // 清除全选状态
        document.getElementById('selectAll').checked = false;
    } catch (error) {
        console.error('批量删除失败:', error);
        showToast('批量删除失败，请重试', 'error');
    }
}

function clearLocalStorage() {
    if (confirm('确定要清除本地缓存吗？这不会影响云端数据。')) {
        localStorage.clear();
        showToast('本地缓存已清除');
        setTimeout(() => {
            location.reload();
        }, 1000);
    }
}

async function exportAllData() {
    try {
        const exportData = {
            exportTime: new Date().toISOString(),
            participants: participants,
            auditLogs: auditLogs,
            statistics: {
                totalParticipants: participants.length,
                totalCombinations: findAllPerfectCombinations(participants, TARGET_SCORE).length,
                totalDeleted: auditLogs.length
            }
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zhiMaFen_data_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('数据导出成功！');
    } catch (error) {
        console.error('导出失败:', error);
        showToast('数据导出失败', 'error');
    }
}

// ==================== 工具函数 ====================
function showToast(message, type = 'success') {
    // 创建提示框
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        ${type === 'error' ? 'background: #ff4d4f;' : 'background: #52c41a;'}
    `;
    toast.textContent = `${type === 'error' ? '❌' : '✅'} ${message}`;
    
    document.body.appendChild(toast);
    
    // 3秒后自动移除
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

// 从 config.js 复制必要的函数
function findAllPerfectCombinations(participants, target) {
    const n = participants.length;
    const allCombos = [];
    
    // 尝试从2人组合开始，逐步增加人数（最多6人）
    for (let size = 2; size <= Math.min(6, n); size++) {
        const combos = getCombinations(participants, size);
        
        for (let combo of combos) {
            const total = combo.reduce((sum, p) => sum + p.score, 0);
            if (total === target) {
                allCombos.push({
                    members: combo,
                    totalScore: total
                });
            }
        }
    }
    
    return allCombos;
}

function getCombinations(arr, size) {
    const result = [];
    
    function helper(start, combo) {
        if (combo.length === size) {
            result.push([...combo]);
            return;
        }
        
        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            helper(i + 1, combo);
            combo.pop();
        }
    }
    
    helper(0, []);
    return result;
}








