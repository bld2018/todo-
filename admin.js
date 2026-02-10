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
    
    // 验证管理员账号（使用config.js中定义的凭证）
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

// ==================== 小红书号验证函数 ====================
function isValidXiaohongshuId(name) {
    // 验证是否为有效的编码格式（支持字母数字混合）
    // 允许：纯数字、字母数字混合、下划线、连字符等常见编码格式
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length >= 3;
}

function getXiaohongshuIdStyle(name) {
    // 专门处理TEST标记的测试ID，确保显示红色
    if (name && name.toUpperCase() === 'TEST') {
        return 'color: #ff4d4f; font-weight: bold; background: #fff1f0; padding: 2px 6px; border-radius: 4px;';
    }
    // 只对标记为TEST的ID显示红色，纯字母或字母+数字的ID正常显示
    return '';
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
    
    tbody.innerHTML = participants.map(p => {
        const nameStyle = getXiaohongshuIdStyle(p.name);
        const warningIcon = !isValidXiaohongshuId(p.name) ? '⚠️ ' : '';
        
        return `
        <tr>
            <td><input type="checkbox" class="select-checkbox" data-id="${p.id}"></td>
            <td><strong>${p.id}</strong></td>
            <td><span style="${nameStyle}">${warningIcon}${p.name}</span></td>
            <td><span class="badge badge-primary">${p.score}</span></td>
            <td>${formatDate(p.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteParticipant('${p.id}', '${p.name}', ${p.score})">
                    🗑️ 删除
                </button>
            </td>
        </tr>
    `;
    }).join('');
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

// ==================== 密码修改功能 ====================
function showChangePasswordModal() {
    closeLoginModal(); // 关闭登录模态框
    document.getElementById('changePasswordModal').style.display = 'flex';
    clearChangePasswordForm();
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('changePasswordError').style.display = 'none';
    clearChangePasswordForm();
}

function clearChangePasswordForm() {
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    document.getElementById('strengthIndicator').className = 'strength-indicator';
    document.getElementById('strengthText').textContent = '密码强度：弱';
}

// 密码强度检测
function checkPasswordStrength(password) {
    let strength = 0;
    let feedback = [];
    
    // 长度检查
    if (password.length >= 8) {
        strength += 25;
    } else {
        feedback.push('密码长度至少8位');
    }
    
    // 包含数字
    if (/\d/.test(password)) {
        strength += 25;
    } else {
        feedback.push('建议包含数字');
    }
    
    // 包含小写字母
    if (/[a-z]/.test(password)) {
        strength += 25;
    } else {
        feedback.push('建议包含小写字母');
    }
    
    // 包含大写字母或特殊字符
    if (/[A-Z!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        strength += 25;
    } else {
        feedback.push('建议包含大写字母或特殊字符');
    }
    
    return { strength, feedback };
}

// 实时密码强度检测
document.addEventListener('DOMContentLoaded', () => {
    const newPasswordInput = document.getElementById('newPassword');
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', function() {
            const password = this.value;
            const { strength, feedback } = checkPasswordStrength(password);
            
            const indicator = document.getElementById('strengthIndicator');
            const strengthText = document.getElementById('strengthText');
            
            // 更新强度条
            indicator.style.width = strength + '%';
            
            // 根据强度设置颜色和文本
            if (strength < 50) {
                indicator.className = 'strength-indicator weak';
                strengthText.textContent = '密码强度：弱';
                strengthText.style.color = '#ff4d4f';
            } else if (strength < 75) {
                indicator.className = 'strength-indicator medium';
                strengthText.textContent = '密码强度：中';
                strengthText.style.color = '#faad14';
            } else {
                indicator.className = 'strength-indicator strong';
                strengthText.textContent = '密码强度：强';
                strengthText.style.color = '#52c41a';
            }
        });
    }
});

async function changeAdminPassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    // 基本验证
    if (!currentPassword || !newPassword || !confirmPassword) {
        showChangePasswordError('请填写所有字段');
        return;
    }
    
    // 验证当前密码
    if (currentPassword !== DEFAULT_ADMIN.getPassword() && currentPassword !== DEFAULT_ADMIN.devPassword) {
        showChangePasswordError('当前密码不正确');
        return;
    }
    
    // 验证新密码强度
    const { strength, feedback } = checkPasswordStrength(newPassword);
    if (strength < 50) {
        showChangePasswordError('新密码强度不足：' + feedback.join('，'));
        return;
    }
    
    // 验证密码确认
    if (newPassword !== confirmPassword) {
        showChangePasswordError('两次输入的新密码不一致');
        return;
    }
    
    // 验证新密码不能与旧密码相同
    if (newPassword === currentPassword) {
        showChangePasswordError('新密码不能与当前密码相同');
        return;
    }
    
    try {
        // 更新密码（这里模拟更新，实际应用中应该调用后端API）
        await updateAdminPassword(newPassword);
        
        // 显示成功消息
        showToast('✅ 密码修改成功！请重新登录');
        
        // 关闭模态框
        closeChangePasswordModal();
        
        // 自动退出登录
        setTimeout(() => {
            logout();
        }, 1500);
        
    } catch (error) {
        console.error('密码修改失败:', error);
        showChangePasswordError('密码修改失败：' + (error.message || '请重试'));
    }
}

function showChangePasswordError(message) {
    const errorEl = document.getElementById('changePasswordError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
}

// 模拟密码更新函数（实际应用中应该调用后端API）
async function updateAdminPassword(newPassword) {
    return new Promise((resolve, reject) => {
        try {
            // 这里应该调用后端API来更新密码
            // 模拟异步操作
            setTimeout(() => {
                // 在开发环境中更新localStorage中的密码
                DEFAULT_ADMIN.setDevPassword(newPassword);
                
                // 如果有后端API，应该这样调用：
                // const response = await fetch('/api/admin/change-password', {
                //     method: 'POST',
                //     headers: { 'Content-Type': 'application/json' },
                //     body: JSON.stringify({ 
                //         currentPassword: currentPassword,
                //         newPassword: newPassword 
                //     })
                // });
                // 
                // if (!response.ok) {
                //     throw new Error('密码更新失败');
                // }
                
                resolve();
            }, 1000);
        } catch (error) {
            reject(error);
        }
    });
}


