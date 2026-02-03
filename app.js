// ==================== 全局变量 ====================
let currentUser = null;
let participants = [];
let pendingDeleteId = null;

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    // 检查 Supabase 是否就绪
    if (!isSupabaseReady()) {
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
    
    // 验证管理员账号
    if (username === DEFAULT_ADMIN.username && password === DEFAULT_ADMIN.password) {
        currentUser = { username, role: 'admin' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        document.getElementById('userStatus').textContent = `👤 ${username}`;
        closeLoginModal();
        showToast('登录成功！');
        
        // 如果在管理后台页面，刷新数据
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
        const { data, error } = await supabaseClient
            .from('participants')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        participants = data || [];
        renderParticipants();
        updateCount();
    } catch (error) {
        console.error('加载参与者失败:', error);
        showToast('加载数据失败，请检查网络连接或数据库配置', 'error');
    }
}

async function addParticipant() {
    const nameInput = document.getElementById('nameInput');
    const scoreInput = document.getElementById('scoreInput');
    
    const name = nameInput.value.trim();
    const score = parseInt(scoreInput.value);
    
    // 验证
    if (!name) {
        showToast('请输入姓名或昵称', 'error');
        return;
    }
    
    if (isNaN(score) || score < 350 || score > 950) {
        showToast('芝麻分必须在350-950之间', 'error');
        return;
    }
    
    try {
        // 生成唯一ID
        const participantId = 'P' + String(Date.now()).slice(-6);
        
        const { error } = await supabaseClient
            .from('participants')
            .insert([{
                id: participantId,
                name: name,
                score: score,
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        // 清空表单
        nameInput.value = '';
        scoreInput.value = '';
        
        // 重新加载数据
        await loadParticipants();
        
        showToast(`✅ ${name} (${participantId}) 已添加`);
    } catch (error) {
        console.error('添加参与者失败:', error);
        showToast('添加失败：' + (error.message || '请检查数据库配置'), 'error');
    }
}

function openDeleteModal(id, name, score) {
    pendingDeleteId = id;
    document.getElementById('deleteTargetInfo').innerHTML = 
        `参与者: <strong>${name}</strong> (${score}分)`;
    document.getElementById('deleteReasonSelect').value = '';
    document.getElementById('deleteReason').value = '';
    document.getElementById('deleteReason').style.display = 'none';
    document.getElementById('customReasonLabel').style.display = 'none';
    document.getElementById('confirmDeleteBtn').disabled = true;
    document.getElementById('deleteModal').style.display = 'flex';
}

function updateCustomReason() {
    const reason = document.getElementById('deleteReasonSelect').value;
    const customReasonEl = document.getElementById('deleteReason');
    const labelEl = document.getElementById('customReasonLabel');
    
    if (reason === '其他') {
        customReasonEl.style.display = 'block';
        labelEl.style.display = 'block';
        customReasonEl.focus();
    } else {
        customReasonEl.style.display = 'none';
        labelEl.style.display = 'none';
        customReasonEl.value = reason;
    }
    
    validateDeleteReason();
}

function validateDeleteReason() {
    const reason = document.getElementById('deleteReasonSelect').value;
    const customReason = document.getElementById('deleteReason').value.trim();
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    
    if (reason === '其他') {
        confirmBtn.disabled = customReason.length < 5;
    } else {
        confirmBtn.disabled = !reason;
    }
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    pendingDeleteId = null;
}

async function confirmDelete() {
    if (!pendingDeleteId) return;
    
    const reason = document.getElementById('deleteReasonSelect').value;
    const customReason = document.getElementById('deleteReason').value.trim();
    const finalReason = reason === '其他' ? customReason : reason;
    
    if (!finalReason || finalReason.length < 5) {
        showError('删除原因至少需要5个字');
        return;
    }
    
    try {
        // 记录审计日志
        const participant = participants.find(p => p.id === pendingDeleteId);
        if (!participant) {
            throw new Error('未找到该参与者');
        }
        
        await supabaseClient.from('audit_log').insert([{
            participant_id: participant.id,
            participant_name: participant.name,
            participant_score: participant.score,
            delete_reason: finalReason,
            deleted_at: new Date().toISOString()
        }]);
        
        // 删除参与者
        const { error } = await supabaseClient
            .from('participants')
            .delete()
            .eq('id', pendingDeleteId);
        
        if (error) throw error;
        
        // 关闭模态框
        closeDeleteModal();
        
        // 重新加载数据
        await loadParticipants();
        
        showToast(`✅ ${participant.name} 已删除\n📝 原因: ${finalReason}`);
    } catch (error) {
        console.error('删除失败:', error);
        showToast('删除失败: ' + (error.message || '请重试'), 'error');
    }
}

function renderParticipants() {
    const listEl = document.getElementById('participantsList');
    
    if (participants.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <p>暂无参与者</p>
                <p class="empty-text">请在左侧添加参与者信息</p>
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = participants.map(p => `
        <div class="participant-item">
            <div>
                <span class="participant-id">${p.id}</span>
                <span class="participant-name">${p.name}</span>
                <span class="participant-score">${p.score}</span>
            </div>
            <button class="btn-remove" onclick="openDeleteModal('${p.id}', '${p.name}', ${p.score})">
                🗑️ 删除
            </button>
        </div>
    `).join('');
}

function updateCount() {
    document.getElementById('participantCount').textContent = participants.length;
}

// ==================== 匹配功能 ====================
async function matchTeams() {
    if (participants.length === 0) {
        showToast('请先添加参与者', 'error');
        return;
    }
    
    if (participants.length === 1) {
        showToast('至少需要2个参与者才能匹配', 'error');
        return;
    }
    
    const combos = findAllPerfectCombinations(participants, TARGET_SCORE);
    
    renderMatchResult(combos);
}

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

function renderMatchResult(combos) {
    const resultEl = document.getElementById('matchResult');
    
    if (combos.length === 0) {
        resultEl.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #fa8c16;">
                <div style="font-size: 3rem; margin-bottom: 20px;">⚠️</div>
                <h3 style="margin-bottom: 15px;">未找到精准匹配</h3>
                <p>未找到总分恰好等于${TARGET_SCORE}的组合</p>
                <p style="margin-top: 15px; color: #8c8c8c;">
                    建议添加更多参与者或调整分数
                </p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div style="text-align: center; margin-bottom: 25px;">
            <div style="font-size: 2.5rem; color: #52c41a; font-weight: bold; margin-bottom: 10px;">
                🎉 找到 ${combos.length} 个完美组合！
            </div>
            <div style="color: #8c8c8c;">总分恰好等于${TARGET_SCORE}分</div>
        </div>
    `;
    
    combos.forEach((combo, index) => {
        const membersHtml = combo.members.map(member => `
            <div class="member-item">
                <div class="member-id">${member.id}</div>
                <div class="member-name">${member.name}</div>
                <div class="member-score">${member.score}</div>
            </div>
        `).join('');
        
        html += `
            <div class="combo-card">
                <div class="combo-header">
                    <div class="combo-index">组合 #${index + 1}</div>
                    <div class="combo-total">${TARGET_SCORE} 分</div>
                </div>
                <div class="combo-members">
                    ${membersHtml}
                </div>
            </div>
        `;
    });
    
    resultEl.innerHTML = html;
}

// ==================== 点击模态框外部关闭 ====================
document.addEventListener('click', (e) => {
    if (e.target.id === 'loginModal' || e.target.id === 'deleteModal') {
        closeLoginModal();
        closeDeleteModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLoginModal();
        closeDeleteModal();
    }
});
