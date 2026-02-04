// 添加全局错误处理
window.addEventListener('error', (event) => {
    console.error('🚨 全局错误:', event.error);
    showToast('发生错误: ' + event.error.message, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 未处理的Promise拒绝:', event.reason);
    showToast('异步操作失败: ' + event.reason, 'error');
});

// ==================== Toast通知函数 ====================
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

// ==================== 全局变量 ====================
let currentUser = null;
let participants = [];
let pendingDeleteId = null;
let allCombinations = []; // 保存所有匹配组合，用于查询功能
let combinationCache = new Map(); // 缓存组合计算结果
let lastParticipantsHash = ''; // 上次参与者的哈希值

// ==================== 登录状态管理 ====================
function checkLoginStatus() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            console.log('👤 已登录用户:', currentUser.username);
            updateUIForLoggedInUser();
        } catch (e) {
            console.error('解析用户信息失败:', e);
            localStorage.removeItem('currentUser');
        }
    } else {
        console.log('🔒 未登录状态');
        // 不再自动弹出登录框，让用户主动点击登录按钮
    }
}

function updateUIForLoggedInUser() {
    const userStatusEl = document.getElementById('userStatus');
    const adminLoginBtn = document.querySelector('[onclick="showAdminLogin()"]');
    
    if (userStatusEl && adminLoginBtn) {
        if (currentUser.role === 'admin') {
            userStatusEl.textContent = `👤 ${currentUser.username} (管理员)`;
            userStatusEl.style.display = 'inline'; // 显示管理员状态
            adminLoginBtn.textContent = '⚙️ 管理后台';
            adminLoginBtn.onclick = function() {
                window.location.href = 'admin.html';
            };
        } else {
            userStatusEl.textContent = `👤 ${currentUser.username}`;
            userStatusEl.style.display = 'inline'; // 显示普通用户状态
            adminLoginBtn.textContent = '⚙️ 管理后台';
            adminLoginBtn.onclick = showAdminLogin;
        }
    }
}

// 修改初始化时的用户状态显示
function initializeUserStatus() {
    const userStatusEl = document.getElementById('userStatus');
    if (userStatusEl) {
        userStatusEl.style.display = 'none'; // 默认隐藏用户状态
    }
}

function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    
    if (!username || !password) {
        showToast('请输入用户名和密码', 'error');
        return;
    }
    
    // 简单的身份验证（实际项目中应该使用后端验证）
    if (username === 'admin' && password === 'admin123') {
        currentUser = { username: 'admin', role: 'admin' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        closeLoginModal();
        updateUIForLoggedInUser();
        showToast('登录成功！', 'success');
    } else {
        showToast('用户名或密码错误', 'error');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    location.reload();
}

// ==================== 性能优化工具函数 ====================
function getParticipantsHash(participantsList) {
    // 生成参与者列表的哈希值，用于缓存判断
    return participantsList.map(p => `${p.id}-${p.name}-${p.score}`).join('|');
}

function getCachedCombinations(participantsList, targetScore) {
    const hash = getParticipantsHash(participantsList);
    if (combinationCache.has(hash)) {
        console.log('🎯 使用缓存的组合结果');
        return combinationCache.get(hash);
    }
    return null;
}

function cacheCombinations(participantsList, combinations) {
    const hash = getParticipantsHash(participantsList);
    combinationCache.set(hash, combinations);
    console.log('💾 缓存组合结果，哈希:', hash);
    
    // 限制缓存大小，避免内存占用过大
    if (combinationCache.size > 10) {
        const firstKey = combinationCache.keys().next().value;
        combinationCache.delete(firstKey);
    }
}

// ==================== 初始化 ====================
async function initializeApp() {
    console.log('🚀 初始化应用...');
    
    try {
        // 检查必要的DOM元素是否存在
        const requiredElements = ['participantsList', 'participantCount', 'nameInput', 'scoreInput'];
        for (let elementId of requiredElements) {
            const element = document.getElementById(elementId);
            if (!element) {
                console.error(`❌ 缺少必要元素: ${elementId}`);
            } else {
                console.log(`✅ 找到元素: ${elementId}`);
            }
        }
        
        // 检查 Supabase 是否就绪
        console.log('🔍 检查Supabase状态...');
        if (!isSupabaseReady()) {
            console.error('❌ Supabase未就绪');
            alert('❌ 数据库未连接！请检查 config.js 配置');
            return;
        }
        console.log('✅ Supabase已就绪');
        
        // 初始化用户状态显示
        initializeUserStatus();
        
        // 检查登录状态
        console.log('👤 检查登录状态...');
        checkLoginStatus();
        
        // 显示加载状态
        console.log('🔄 显示加载状态...');
        showLoadingState(true, '正在加载数据...');
        
        // 加载参与者数据
        console.log('📥 开始加载参与者数据...');
        await loadParticipants();
        console.log('✅ 数据加载完成');
        
        // 设置回车键提交
        document.getElementById('nameInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('scoreInput').focus();
        });
        
        document.getElementById('scoreInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addParticipant();
        });
        
        console.log('✅ 应用初始化完成');
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        showToast('系统初始化失败，请刷新页面重试', 'error');
    } finally {
        console.log('🏁 隐藏加载状态');
        showLoadingState(false);
    }
}

// DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initializeApp);

function showLoadingState(show, message = '数据加载中...') {
    const loadingEl = document.getElementById('globalLoadingIndicator');
    const loadingText = document.getElementById('loadingText');
    const progressBar = document.getElementById('progressBar');
    
    if (show) {
        if (loadingEl) {
            loadingEl.style.display = 'flex';
            if (loadingText) loadingText.textContent = message;
            if (progressBar) {
                // 模拟进度条动画
                let progress = 0;
                const interval = setInterval(() => {
                    progress += Math.random() * 15;
                    if (progress >= 90) {
                        progress = 90;
                        clearInterval(interval);
                    }
                    if (progressBar) {
                        progressBar.style.width = progress + '%';
                    }
                }, 200);
                
                // 保存interval引用以便清理
                loadingEl._progressInterval = interval;
            }
        }
    } else if (loadingEl) {
        loadingEl.style.display = 'none';
        if (loadingEl._progressInterval) {
            clearInterval(loadingEl._progressInterval);
            loadingEl._progressInterval = null;
        }
        if (progressBar) {
            progressBar.style.width = '100%';
        }
    }
}

// 添加按钮加载状态管理
function setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (button) {
        if (loading) {
            button.classList.add('btn-loading');
            button.disabled = true;
        } else {
            button.classList.remove('btn-loading');
            button.disabled = false;
        }
    }
}

// ==================== 小红书号验证函数 ====================
function isValidXiaohongshuId(name) {
    // 验证是否为纯数字编码
    return /^\d+$/.test(name);
}

function getXiaohongshuIdStyle(name) {
    // 如果不是纯数字编码，返回红色样式
    if (!isValidXiaohongshuId(name)) {
        return 'color: #ff4d4f; font-weight: bold; background: #fff1f0; padding: 2px 6px; border-radius: 4px;';
    }
    return '';
}

// ==================== 参与者管理 ====================
async function loadParticipants() {
    try {
        console.time('加载参与者数据');
        console.log('📡 正在从数据库获取参与者数据...');
        
        const { data, error } = await supabaseClient
            .from('participants')
            .select('*')
            .order('created_at', { ascending: false });
        
        console.log('📊 数据库响应:', { data, error });
        
        if (error) {
            console.error('❌ 数据库查询错误:', error);
            throw error;
        }
        
        participants = data || [];
        console.log(`👥 获取到 ${participants.length} 个参与者`);
        
        // 检查是否需要重新计算组合
        const currentHash = getParticipantsHash(participants);
        if (currentHash !== lastParticipantsHash) {
            console.log('🔄 参与者列表已变更，需要重新计算组合');
            allCombinations = []; // 清空旧的组合结果
            combinationCache.clear(); // 清空缓存
            lastParticipantsHash = currentHash;
        }
        
        console.log('🎨 渲染参与者列表...');
        renderParticipants();
        console.log('🔢 更新计数器...');
        updateCount();
        console.timeEnd('加载参与者数据');
    } catch (error) {
        console.error('❌ 加载参与者失败:', error);
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
        showToast('请输入小红书号', 'error');
        return;
    }
    
    // 验证小红书号格式
    if (!isValidXiaohongshuId(name)) {
        if (!confirm('⚠️ 检测到您输入的可能不是标准小红书数字ID，是否继续添加？\n\n标准小红书ID应该是纯数字编码')) {
            return;
        }
    }
    
    if (isNaN(score) || score < 350 || score > 950) {
        showToast('芝麻分必须在350-950之间', 'error');
        return;
    }
    
    try {
        showLoadingState(true);
        console.time('添加参与者');
        
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
        console.timeEnd('添加参与者');
    } catch (error) {
        console.error('添加参与者失败:', error);
        showToast('添加失败：' + (error.message || '请检查数据库配置'), 'error');
    } finally {
        showLoadingState(false);
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
    
    // 验证删除原因 - 只有"已组队成功"才允许删除
    if (finalReason !== '已组队成功') {
        showError('❌ 删除失败：只有选择"已组队成功"才能删除参与者');
        return;
    }
    
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
    
    listEl.innerHTML = participants.map(p => {
        const nameStyle = getXiaohongshuIdStyle(p.name);
        const warningIcon = !isValidXiaohongshuId(p.name) ? '⚠️ ' : '';
        
        return `
        <div class="participant-item">
            <div>
                <span class="participant-id">${p.id}</span>
                <span class="participant-name" style="${nameStyle}">${warningIcon}${p.name}</span>
                <span class="participant-score">${p.score}</span>
            </div>
            <button class="btn-remove" onclick="showAdminApprovalRequired()">
                🗑️ 删除
            </button>
        </div>
    `;
    }).join('');
}

function updateCount() {
    document.getElementById('participantCount').textContent = participants.length;
}

// ==================== 匹配功能优化 ====================
async function matchTeams() {
    if (participants.length === 0) {
        showToast('请先添加参与者', 'error');
        return;
    }
    
    if (participants.length === 1) {
        showToast('至少需要2个参与者才能匹配', 'error');
        return;
    }
    
    // 设置按钮加载状态
    setButtonLoading('matchTeamsBtn', true);
    showLoadingState(true, '正在计算最佳组合...');
    
    console.time('匹配计算');
    
    try {
        // 先检查缓存
        const cachedResult = getCachedCombinations(participants, TARGET_SCORE);
        if (cachedResult) {
            console.log('🎯 使用缓存的组合结果');
            allCombinations = cachedResult;
            renderMatchResult(cachedResult);
            showToast('✅ 使用缓存结果，加载更快！', 'success');
            console.timeEnd('匹配计算');
            return;
        }
        
        // 计算组合（优化版本）
        const combos = await calculateCombinationsOptimized(participants, TARGET_SCORE);
        
        // 缓存结果
        cacheCombinations(participants, combos);
        allCombinations = combos;
        
        renderMatchResult(combos);
        
        if (combos.length > 0) {
            showToast(`✅ 找到 ${combos.length} 个完美组合！`, 'success');
        } else {
            showToast('⚠️ 未找到匹配组合，建议添加更多参与者', 'warning');
        }
        
        console.timeEnd('匹配计算');
    } catch (error) {
        console.error('匹配计算失败:', error);
        showToast('匹配计算失败，请重试', 'error');
    } finally {
        showLoadingState(false);
        setButtonLoading('matchTeamsBtn', false);
    }
}

// 优化的组合生成函数 - 使用迭代而非递归
function getCombinations(arr, size) {
    if (size > arr.length || size <= 0) return [];
    if (size === 1) return arr.map(item => [item]);
    
    const result = [];
    const indices = Array(size).fill(0);
    
    // 初始化索引
    for (let i = 0; i < size; i++) {
        indices[i] = i;
    }
    
    while (true) {
        // 添加当前组合
        const combo = indices.map(i => arr[i]);
        result.push(combo);
        
        // 找到下一个组合
        let i = size - 1;
        while (i >= 0 && indices[i] === arr.length - size + i) {
            i--;
        }
        
        if (i < 0) break;
        
        indices[i]++;
        for (let j = i + 1; j < size; j++) {
            indices[j] = indices[j-1] + 1;
        }
    }
    
    return result;
}

// 更高效的组合计算函数
async function calculateCombinationsOptimized(participants, target) {
    const n = participants.length;
    const allCombos = [];
    
    // 限制最大计算时间，避免浏览器卡死
    const startTime = Date.now();
    const MAX_CALCULATION_TIME = 3000; // 3秒超时
    
    console.log(`🔍 开始计算组合，参与者数量: ${n}`);
    
    // 预先计算每个人的分数，避免重复计算
    const scores = participants.map(p => p.score);
    
    // 尝试从2人组合开始，逐步增加人数（最多6人）
    outerLoop: for (let size = 2; size <= Math.min(6, n); size++) {
        console.log(`📊 计算 ${size} 人组合...`);
        
        // 使用优化的组合生成
        const combos = getCombinations(participants, size);
        console.log(`  生成 ${combos.length} 个 ${size} 人组合`);
        
        // 检查是否超时
        if (Date.now() - startTime > MAX_CALCULATION_TIME) {
            console.warn('⏰ 计算超时，提前结束');
            showToast('⚠️ 计算时间过长，已显示部分结果', 'warning');
            break;
        }
        
        // 查找符合条件的组合（使用预计算的分数数组）
        for (let combo of combos) {
            let total = 0;
            for (let member of combo) {
                total += member.score;
            }
            if (total === target) {
                allCombos.push({
                    members: combo,
                    totalScore: total
                });
            }
        }
    }
    
    console.log(`✅ 找到 ${allCombos.length} 个匹配组合`);
    return allCombos;
}

// 添加防抖功能，避免频繁触发计算
let matchDebounceTimer = null;
function debouncedMatchTeams() {
    if (matchDebounceTimer) {
        clearTimeout(matchDebounceTimer);
    }
    
    matchDebounceTimer = setTimeout(() => {
        matchTeams();
    }, 300); // 300ms防抖延迟
}

function renderMatchResult(combos) {
    const resultEl = document.getElementById('matchResult');
    const queryResultEl = document.getElementById('queryResult');
    
    // 隐藏查询结果
    if (queryResultEl) {
        queryResultEl.style.display = 'none';
    }
    
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
    
    // 添加提示：可以查询特定用户
    if (combos.length > 0) {
        html += `
            <div style="margin-top: 30px; padding: 15px; background: #e6f7ff; border-radius: 10px; border-left: 4px solid #1890ff;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="font-size: 1.5rem;">💡</div>
                    <div>
                        <strong>快速查询：</strong>在上方输入用户ID（如 P123456），即可查看该用户参与的所有匹配组合
                    </div>
                </div>
            </div>
        `;
    }
    
    resultEl.innerHTML = html;
}

// ==================== 查询类型管理 ====================
let currentQueryType = 'id'; // 'id' 或 'name'

function setQueryType(type) {
    currentQueryType = type;
    
    // 更新按钮状态
    const idBtn = document.getElementById('queryByIdBtn');
    const nameBtn = document.getElementById('queryByNameBtn');
    const idSection = document.getElementById('idQuerySection');
    const nameSection = document.getElementById('nameQuerySection');
    
    if (type === 'id') {
        idBtn.classList.remove('btn-outline');
        idBtn.classList.add('btn-primary');
        nameBtn.classList.remove('btn-primary');
        nameBtn.classList.add('btn-outline');
        idSection.style.display = 'block';
        nameSection.style.display = 'none';
    } else {
        nameBtn.classList.remove('btn-outline');
        nameBtn.classList.add('btn-primary');
        idBtn.classList.remove('btn-primary');
        idBtn.classList.add('btn-outline');
        nameSection.style.display = 'block';
        idSection.style.display = 'none';
    }
}

// ==================== 查询组合（小红书号查询）====================
function queryCombinations() {
    const queryName = document.getElementById('queryNameInput').value.trim();
    
    if (!queryName) {
        showToast('请输入小红书号', 'error');
        return;
    }
    
    // 检查是否已进行匹配
    if (allCombinations.length === 0) {
        if (confirm('尚未进行匹配，是否先执行匹配？')) {
            matchTeams();
            // 延迟执行查询（等待匹配完成）
            setTimeout(() => {
                performQueryByName(queryName);
            }, 1500);
        }
        return;
    }
    
    // 直接执行查询
    performQueryByName(queryName);
}

function performQueryByName(queryName) {
    // 过滤包含该小红书号的组合
    const filtered = allCombinations.filter(combo => 
        combo.members.some(member => member.name === queryName)
    );
    
    // 显示查询结果
    renderQueryResultByName(filtered, queryName);
}

function renderQueryResultByName(combos, queryName) {
    const resultEl = document.getElementById('queryResult');
    const matchResultEl = document.getElementById('matchResult');
    
    // 隐藏常规匹配结果
    if (matchResultEl) {
        matchResultEl.style.display = 'none';
    }
    // 显示查询结果区域
    if (resultEl) {
        resultEl.style.display = 'block';
    }
    
    if (combos.length === 0) {
        resultEl.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #fa8c16; background: #fff7e6; border-radius: 12px;">
                <div style="font-size: 3rem; margin-bottom: 20px;">🔍</div>
                <h3 style="margin-bottom: 15px;">未找到包含小红书号 ${queryName} 的组合</h3>
                <p>当前没有总分恰好等于${TARGET_SCORE}且包含该用户的组合</p>
                <p style="margin-top: 15px; color: #8c8c8c;">
                    💡 建议：添加更多参与者或调整分数，重新匹配
                </p>
                <button class="btn btn-primary" style="margin-top: 20px;" onclick="matchTeams()">
                    <span class="btn-icon">🔄</span> 重新匹配
                </button>
            </div>
        `;
        return;
    }
    
    let html = `
        <div style="text-align: center; margin-bottom: 25px; padding: 20px; background: linear-gradient(135deg, #e6f7ff 0%, #f6ffed 100%); border-radius: 12px;">
            <div style="font-size: 2.2rem; color: #1890ff; font-weight: bold; margin-bottom: 10px;">
                🎯 找到 ${combos.length} 个包含小红书号 ${queryName} 的组合
            </div>
            <div style="color: #595959; font-size: 1.1rem;">
                以下组合总分恰好等于 ${TARGET_SCORE} 分，且包含用户 ${queryName}
            </div>
        </div>
    `;
    
    combos.forEach((combo, index) => {
        // 高亮显示查询的用户
        const membersHtml = combo.members.map(member => {
            const isTarget = member.name === queryName;
            return `
                <div class="member-item" style="${isTarget ? 'border: 3px solid #1890ff; transform: scale(1.05);' : ''}">
                    ${isTarget ? '<div style="position: absolute; top: -10px; right: -10px; background: #ff4d4f; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem;">!</div>' : ''}
                    <div class="member-id" style="${isTarget ? 'background: #1890ff; color: white;' : ''}">${member.id}</div>
                    <div class="member-name" style="${isTarget ? 'color: #1890ff; font-weight: bold;' : ''}">${member.name}</div>
                    <div class="member-score" style="${isTarget ? 'color: #1890ff;' : ''}">${member.score}</div>
                </div>
            `;
        }).join('');
        
        html += `
            <div class="combo-card" style="border-left: 5px solid #1890ff;">
                <div class="combo-header">
                    <div class="combo-index" style="background: linear-gradient(120deg, #1890ff 0%, #40a9ff 100%);">
                        组合 #${index + 1}
                    </div>
                    <div class="combo-total">${TARGET_SCORE} 分</div>
                </div>
                <div class="combo-members">
                    ${membersHtml}
                </div>
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e8e8e8; text-align: center; color: #8c8c8c; font-size: 0.95rem;">
                    <strong>成员信息:</strong> ${combo.members.map(m => `${m.id}(${m.name})`).join(', ')}
                </div>
            </div>
        `;
    });
    
    // 添加返回按钮
    html += `
        <div style="text-align: center; margin-top: 25px;">
            <button class="btn btn-outline" onclick="clearQuery()" style="padding: 10px 25px;">
                <span class="btn-icon">←</span> 返回全部结果
            </button>
        </div>
    `;
    
    resultEl.innerHTML = html;
}

function clearQuery() {
    const queryInput = document.getElementById('queryIdInput');
    const queryResultEl = document.getElementById('queryResult');
    const matchResultEl = document.getElementById('matchResult');
    
    if (queryInput) {
        queryInput.value = '';
    }
    if (queryResultEl) {
        queryResultEl.style.display = 'none';
    }
    if (matchResultEl) {
        matchResultEl.style.display = 'block';
    }
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

// ==================== 管理后台登录功能 ====================
function showAdminLogin() {
    // 检查是否已登录
    if (currentUser && currentUser.role === 'admin') {
        // 已登录管理员，直接跳转到管理后台
        window.location.href = 'admin.html';
    } else {
        // 未登录或非管理员，显示管理员登录框
        document.getElementById('adminLoginModal').style.display = 'flex';
    }
}

function closeAdminLoginModal() {
    document.getElementById('adminLoginModal').style.display = 'none';
    document.getElementById('adminLoginError').style.display = 'none';
}

async function performAdminLogin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    
    if (!username || !password) {
        document.getElementById('adminLoginError').textContent = '请输入用户名和密码';
        document.getElementById('adminLoginError').style.display = 'block';
        return;
    }
    
    // 验证管理员账号（这里使用简单的硬编码验证，实际项目中应该使用后端验证）
    const ADMIN_CREDENTIALS = {
        username: 'admin',
        password: 'admin123'
    };
    
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        currentUser = { username: 'admin', role: 'admin' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        document.getElementById('userStatus').textContent = `👤 ${username} (管理员)`;
        closeAdminLoginModal();
        showToast('管理员登录成功！');
        
        // 跳转到管理后台
        setTimeout(() => {
            window.location.href = 'admin.html';
        }, 1000);
    } else {
        document.getElementById('adminLoginError').textContent = '用户名或密码错误';
        document.getElementById('adminLoginError').style.display = 'block';
    }
}

// ==================== 管理员审核提示 ====================
function showAdminApprovalRequired() {
    alert('⚠️ 需要管理员审核\n\n删除操作需要管理员权限，请前往管理后台进行操作。');
}
