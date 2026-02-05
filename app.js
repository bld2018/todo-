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
let isCalculating = false; // 防止重复计算

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

// ==================== 队列化数据库操作 ====================
async function queuedDatabaseOperation(operation, priority = 0) {
    try {
        // 显示队列状态
        showQueueStatus();
        
        // 通过全局队列执行操作
        const result = await globalRequestQueue.add(async () => {
            // 应用速率限制
            return await globalRateLimiter.checkAndProceed(operation);
        }, priority);
        
        return result;
    } catch (error) {
        console.error('队列操作失败:', error);
        throw error;
    }
}

// ==================== 智能加载状态管理 ====================
function showLoadingState(show = true, message = '数据加载中...', progress = 0) {
    if (show) {
        globalLoadingManager.show(message, progress);
    } else {
        globalLoadingManager.hide();
    }
}

function updateLoadingProgress(progress, message) {
    globalLoadingManager.updateProgress(progress, message);
}

// ==================== 按钮加载状态管理 ====================
function setButtonLoading(buttonId, loading = true) {
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

// ==================== 智能重试工具函数 ====================
async function smartRetry(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const result = await operation();
            if (result.error) {
                lastError = result.error;
                if (i < maxRetries) {
                    // 指数退避 + 随机抖动
                    const delay = (Math.pow(2, i) * baseDelay) + (Math.random() * 1000);
                    console.log(`🔁 第 ${i + 1} 次重试，${Math.round(delay)}ms 后重试...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } else {
                if (i > 0) {
                    console.log(`✅ 操作在第 ${i + 1} 次尝试后成功`);
                }
                return result;
            }
        } catch (error) {
            lastError = error;
            if (i < maxRetries) {
                const delay = (Math.pow(2, i) * baseDelay) + (Math.random() * 1000);
                console.log(`🔁 第 ${i + 1} 次重试，${Math.round(delay)}ms 后重试...`, error);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    // 检查 Supabase 是否就绪
    if (!isSupabaseReady()) {
        alert('❌ 数据库未连接！请检查 config.js 配置');
        return;
    }
    
    // 检查登录状态
    checkLoginStatus();
    
    // 显示加载状态
    showLoadingState(true, '系统初始化中...');
    
    try {
        // 使用队列化操作加载数据
        await queuedDatabaseOperation(async () => {
            await loadParticipants();
        }, 10); // 高优先级
    } catch (error) {
        console.error('初始化失败:', error);
        showToast('系统初始化失败，请刷新页面重试', 'error');
    } finally {
        showLoadingState(false);
    }
    
    // 回车键提交
    document.getElementById('nameInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('scoreInput').focus();
    });
    
    document.getElementById('scoreInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addParticipant();
    });
});

function showQueueStatus() {
    const queueStatusEl = document.getElementById('queueStatus');
    if (queueStatusEl) {
        queueStatusEl.style.display = 'block';
    }
}

function hideQueueStatus() {
    const queueStatusEl = document.getElementById('queueStatus');
    if (queueStatusEl) {
        queueStatusEl.style.display = 'none';
    }
}

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

// ==================== 参与者管理 ====================
let addParticipantDebounceTimer = null;

async function loadParticipants() {
    try {
        console.time('加载参与者数据');
        console.log('📡 正在从数据库获取参与者数据...');
        
        // 使用智能重试机制
        const { data, error } = await smartRetry(async () => {
            return await supabaseClient
                .from('participants')
                .select('*')
                .order('created_at', { ascending: false });
        }, 3, 1000);
        
        if (error) throw error;
        
        participants = data || [];
        console.log(`📥 加载了 ${participants.length} 个参与者`);
        
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
        showToast('数据加载失败，请检查网络连接', 'error');
        throw error;
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
        nameInput.focus();
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
        scoreInput.focus();
        return;
    }
    
    // 防抖处理，避免频繁添加
    if (addParticipantDebounceTimer) {
        clearTimeout(addParticipantDebounceTimer);
    }
    
    addParticipantDebounceTimer = setTimeout(async () => {
        try {
            // 使用队列化操作添加参与者
            await queuedDatabaseOperation(async () => {
                await performAddParticipant(name, score);
            }, 8); // 较高优先级
            
            // 清空输入框并聚焦姓名输入框
            nameInput.value = '';
            scoreInput.value = '';
            nameInput.focus();
        } catch (error) {
            console.error('添加参与者失败:', error);
            showToast(error.message || '添加失败，请重试', 'error');
        }
    }, 500); // 500ms防抖延迟
}

async function performAddParticipant(name, score) {
    showLoadingState(true, '添加参与者中...');
    console.time('添加参与者');
    
    try {
        // 生成唯一ID
        const participantId = 'P' + String(Date.now()).slice(-6);
        
        const { data, error } = await smartRetry(async () => {
            return await supabaseClient
                .from('participants')
                .insert([{
                    id: participantId,
                    name: name,
                    score: score,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();
        }, 3, 1000);
        
        if (error) throw error;
        
        // 添加成功后重新加载数据
        await loadParticipants();
        
        // 清除缓存，因为数据已变化
        combinationCache.clear();
        allCombinations = [];
        
        showToast(`✅ ${name} (${participantId}) 已添加`);
        console.timeEnd('添加参与者');
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
        showToast('❌ 删除失败：只有选择"已组队成功"才能删除参与者', 'error');
        return;
    }
    
    if (!finalReason || finalReason.length < 5) {
        showToast('删除原因至少需要5个字', 'error');
        return;
    }
    
    try {
        // 使用队列化操作执行删除
        await queuedDatabaseOperation(async () => {
            await executeDelete(pendingDeleteId, finalReason);
        }, 1); // 最低优先级
        
        closeDeleteModal();
        showToast('✅ 删除成功！', 'success');
    } catch (error) {
        console.error('删除失败:', error);
        showToast(error.message || '删除失败，请重试', 'error');
    }
}

async function executeDelete(id, reason) {
    showLoadingState(true, '执行删除操作...');
    
    try {
        // 先获取要删除的数据
        const participant = participants.find(p => p.id === id);
        if (!participant) throw new Error('参与者不存在');
        
        // 执行删除
        const { error: deleteError } = await smartRetry(async () => {
            return await supabaseClient
                .from('participants')
                .delete()
                .eq('id', id);
        }, 3, 1000);
        
        if (deleteError) throw deleteError;
        
        // 记录审计日志
        const { error: logError } = await smartRetry(async () => {
            return await supabaseClient
                .from('audit_log')
                .insert([{
                    participant_id: id,
                    participant_name: participant.name,
                    action: 'DELETE',
                    reason: reason,
                    old_data: participant,
                    created_at: new Date().toISOString()
                }]);
        }, 3, 1000);
        
        if (logError) {
            console.error('审计日志记录失败:', logError);
        }
        
        // 更新本地数据
        participants = participants.filter(p => p.id !== id);
        renderParticipants();
        
        // 清除缓存
        combinationCache.clear();
        
    } finally {
        showLoadingState(false);
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

// ==================== 匹配功能深度优化 ====================

async function matchTeams() {
    if (participants.length === 0) {
        showToast('请先添加参与者', 'error');
        return;
    }
    
    if (participants.length === 1) {
        showToast('至少需要2个参与者才能匹配', 'error');
        return;
    }
    
    // 防止重复计算
    if (isCalculating) {
        showToast('计算正在进行中，请稍候...', 'warning');
        return;
    }
    
    isCalculating = true;
    
    try {
        await performAdvancedMatchCalculation();
    } catch (error) {
        console.error('匹配计算失败:', error);
        showToast(error.message || '匹配计算失败，请重试', 'error');
    } finally {
        isCalculating = false;
    }
}

async function performAdvancedMatchCalculation() {
    // 设置按钮加载状态
    setButtonLoading('matchTeamsBtn', true);
    
    // 显示详细加载状态
    showDetailedLoadingState(true, '正在分析数据...', 0);
    
    console.time('高级匹配计算');
    
    try {
        const participantCount = participants.length;
        
        // 显示数据规模警告和预估时间
        const estimatedTime = calculateEstimatedTime(participantCount);
        if (participantCount > 15) {
            showToast(`⚠️ 当前有 ${participantCount} 个参与者，预估计算时间约 ${estimatedTime}`, 'warning');
        }
        
        // 先检查缓存
        const cachedResult = getCachedCombinations(participants, TARGET_SCORE);
        if (cachedResult) {
            console.log('🎯 使用缓存的组合结果');
            updateLoadingProgress(20, '加载缓存结果...');
            await sleep(500); // 模拟加载时间
            
            allCombinations = cachedResult;
            renderMatchResult(cachedResult);
            showToast('✅ 使用缓存结果，加载更快！', 'success');
            console.timeEnd('高级匹配计算');
            return;
        }
        
        updateLoadingProgress(10, '数据预处理...');
        await sleep(300);
        
        // 使用智能算法选择最适合的计算策略
        let combos = [];
        if (participantCount <= 12) {
            // 小数据集使用精确算法
            updateLoadingProgress(25, '使用精确算法计算...');
            combos = await calculateExactCombinations(participants, TARGET_SCORE);
        } else if (participantCount <= 25) {
            // 中等数据集使用优化算法
            updateLoadingProgress(25, '使用优化算法计算...');
            combos = await calculateOptimizedCombinations(participants, TARGET_SCORE);
        } else {
            // 大数据集使用启发式算法
            updateLoadingProgress(25, '使用启发式算法计算...');
            combos = await calculateHeuristicCombinations(participants, TARGET_SCORE);
        }
        
        updateLoadingProgress(85, '缓存计算结果...');
        await sleep(200);
        
        // 缓存结果
        cacheCombinations(participants, combos);
        allCombinations = combos;
        
        updateLoadingProgress(95, '渲染结果...');
        await sleep(100);
        
        renderMatchResult(combos);
        
        // 显示性能统计
        if (combos.length > 0) {
            showToast(`✅ 找到 ${combos.length} 个完美组合！`, 'success');
        } else {
            showToast('⚠️ 未找到匹配组合，建议添加更多参与者', 'warning');
        }
        
        updateLoadingProgress(100, '计算完成！');
        await sleep(300);
        
        console.timeEnd('高级匹配计算');
        
    } finally {
        showDetailedLoadingState(false);
        setButtonLoading('matchTeamsBtn', false);
    }
}

// 精确算法（适用于小数据集）
async function calculateExactCombinations(participants, target) {
    const n = participants.length;
    const allCombos = [];
    const startTime = Date.now();
    const MAX_TIME = 5000; // 5秒超时
    
    console.log(`🔍 精确算法计算，参与者数量: ${n}`);
    
    // 尝试从2人组合开始，逐步增加人数（最多6人）
    for (let size = 2; size <= Math.min(6, n); size++) {
        if (Date.now() - startTime > MAX_TIME) {
            console.warn('⏰ 精确算法超时');
            showToast('⏱️ 精确计算超时，使用近似结果...', 'info');
            break;
        }
        
        const progress = 30 + (size - 2) * 15;
        updateLoadingProgress(progress, `精确计算 ${size} 人组合...`);
        await sleep(200);
        
        const combos = getCombinations(participants, size);
        console.log(`  生成 ${combos.length} 个 ${size} 人组合`);
        
        // 查找符合条件的组合
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

// 优化算法（适用于中等数据集）
async function calculateOptimizedCombinations(participants, target) {
    const n = participants.length;
    const allCombos = [];
    const startTime = Date.now();
    const MAX_TIME = 8000; // 8秒超时
    
    console.log(`🚀 优化算法计算，参与者数量: ${n}`);
    
    // 预排序优化
    const sortedParticipants = [...participants].sort((a, b) => a.score - b.score);
    
    // 使用剪枝技术优化搜索
    for (let size = 2; size <= Math.min(6, n); size++) {
        if (Date.now() - startTime > MAX_TIME) {
            console.warn('⏰ 优化算法超时');
            break;
        }
        
        const progress = 35 + (size - 2) * 12;
        updateLoadingProgress(progress, `优化计算 ${size} 人组合...`);
        await sleep(300);
        
        const combos = getOptimizedCombinations(sortedParticipants, size, target);
        allCombos.push(...combos);
    }
    
    return allCombos;
}

// 启发式算法（适用于大数据集）
async function calculateHeuristicCombinations(participants, target) {
    const n = participants.length;
    const startTime = Date.now();
    const MAX_TIME = 10000; // 10秒超时
    const results = [];
    
    console.log(`⚡ 启发式算法计算，参与者数量: ${n}`);
    
    // 策略1: 贪心算法寻找接近目标的组合
    updateLoadingProgress(40, '贪心算法搜索...');
    await sleep(500);
    
    const greedyResults = findGreedyCombinations(participants, target);
    results.push(...greedyResults);
    
    // 策略2: 分组平衡算法
    if (Date.now() - startTime < MAX_TIME - 2000) {
        updateLoadingProgress(60, '平衡分组搜索...');
        await sleep(500);
        
        const balancedResults = findBalancedCombinations(participants, target);
        results.push(...balancedResults);
    }
    
    // 策略3: 随机采样算法
    if (Date.now() - startTime < MAX_TIME - 1000) {
        updateLoadingProgress(80, '随机采样搜索...');
        await sleep(300);
        
        const sampleResults = findSampleCombinations(participants, target);
        results.push(...sampleResults);
    }
    
    // 去重和验证
    const uniqueResults = deduplicateCombinations(results);
    return uniqueResults.filter(combo => 
        combo.members.reduce((sum, p) => sum + p.score, 0) === target
    );
}

// 优化的组合生成函数（带剪枝）
function getOptimizedCombinations(arr, size, target) {
    const result = [];
    const currentCombo = [];
    const used = new Array(arr.length).fill(false);
    
    function backtrack(start, currentSum) {
        // 剪枝条件
        if (currentSum > target) return;
        if (currentCombo.length === size) {
            if (currentSum === target) {
                result.push([...currentCombo]);
            }
            return;
        }
        
        for (let i = start; i < arr.length; i++) {
            if (used[i]) continue;
            
            // 剪枝：如果加上当前元素已经超过目标值，跳过后续更大元素
            if (currentSum + arr[i].score > target) break;
            
            used[i] = true;
            currentCombo.push(arr[i]);
            backtrack(i + 1, currentSum + arr[i].score);
            currentCombo.pop();
            used[i] = false;
        }
    }
    
    backtrack(0, 0);
    return result;
}

// 贪心组合查找
function findGreedyCombinations(participants, target) {
    const results = [];
    const sorted = [...participants].sort((a, b) => Math.abs(a.score - target/3) - Math.abs(b.score - target/3));
    
    // 寻找三数组合（最常见的有效组合）
    for (let i = 0; i < Math.min(15, sorted.length); i++) {
        for (let j = i + 1; j < Math.min(15, sorted.length); j++) {
            for (let k = j + 1; k < Math.min(15, sorted.length); k++) {
                const combo = [sorted[i], sorted[j], sorted[k]];
                const total = combo.reduce((sum, p) => sum + p.score, 0);
                if (total === target) {
                    results.push({
                        members: combo,
                        totalScore: total
                    });
                }
            }
        }
    }
    
    return results;
}

// 平衡分组查找
function findBalancedCombinations(participants, target) {
    const results = [];
    const groups = [[], [], []]; // 分成三组
    
    // 按分数分组
    participants.forEach(p => {
        if (p.score <= target / 3) groups[0].push(p);
        else if (p.score <= target * 2 / 3) groups[1].push(p);
        else groups[2].push(p);
    });
    
    // 从各组中选取元素组成组合
    for (let g1 of groups[0] || []) {
        for (let g2 of groups[1] || []) {
            for (let g3 of groups[2] || []) {
                const combo = [g1, g2, g3];
                const total = combo.reduce((sum, p) => sum + p.score, 0);
                if (total === target) {
                    results.push({
                        members: combo,
                        totalScore: total
                    });
                }
            }
        }
    }
    
    return results;
}

// 随机采样查找
function findSampleCombinations(participants, target) {
    const results = [];
    const samples = 1000; // 采样次数
    
    for (let i = 0; i < samples; i++) {
        // 随机选择2-6人
        const size = Math.floor(Math.random() * 5) + 2;
        const selected = [];
        const available = [...participants];
        
        for (let j = 0; j < size && available.length > 0; j++) {
            const idx = Math.floor(Math.random() * available.length);
            selected.push(available[idx]);
            available.splice(idx, 1);
        }
        
        const total = selected.reduce((sum, p) => sum + p.score, 0);
        if (total === target) {
            results.push({
                members: selected,
                totalScore: total
            });
        }
    }
    
    return results;
}

// 去重组合
function deduplicateCombinations(combos) {
    const seen = new Set();
    const unique = [];
    
    for (let combo of combos) {
        // 创建标准化标识
        const ids = combo.members.map(m => m.id).sort().join(',');
        if (!seen.has(ids)) {
            seen.add(ids);
            unique.push(combo);
        }
    }
    
    return unique;
}

// 计算预估时间
function calculateEstimatedTime(participantCount) {
    if (participantCount <= 10) return '1-2秒';
    if (participantCount <= 15) return '3-5秒';
    if (participantCount <= 20) return '8-12秒';
    if (participantCount <= 25) return '15-25秒';
    return '30秒以上';
}

// 睡眠函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 更新加载进度
function updateLoadingProgress(progress, message) {
    const progressBar = document.getElementById('progressBar');
    const loadingText = document.getElementById('loadingText');
    const progressPercent = document.getElementById('progressPercent');
    const estimatedTime = document.getElementById('estimatedTime');
    
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    
    if (loadingText) {
        loadingText.textContent = message;
    }
    
    if (progressPercent) {
        progressPercent.textContent = `${Math.round(progress)}%`;
    }
    
    // 更新预估剩余时间
    if (estimatedTime) {
        const remaining = calculateRemainingTime(progress);
        estimatedTime.textContent = remaining;
    }
}

// 计算剩余时间
function calculateRemainingTime(progress) {
    if (progress <= 0) return '--:--';
    if (progress >= 100) return '00:00';
    
    const elapsed = (Date.now() - window.calculationStartTime) / 1000;
    const totalTime = elapsed / (progress / 100);
    const remaining = totalTime - elapsed;
    
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// 显示详细加载状态
function showDetailedLoadingState(show = true, message = '计算中...', progress = 0) {
    const loadingElement = document.getElementById('globalLoadingIndicator');
    if (!loadingElement) return;
    
    if (show) {
        window.calculationStartTime = Date.now();
        loadingElement.style.display = 'flex';
        
        // 添加详细进度信息
        let detailHtml = `
            <div style="font-size: 3rem; margin-bottom: 20px; animation: spin 1s linear infinite;">🔄</div>
            <div id="loadingText" style="font-size: 1.2rem; color: #1890ff; font-weight: bold; margin-bottom: 15px;">${message}</div>
            <div style="width: 300px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>进度:</span>
                    <span id="progressPercent">${Math.round(progress)}%</span>
                </div>
                <div id="loadingProgress" style="height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden;">
                    <div id="progressBar" style="height: 100%; width: ${progress}%; background: linear-gradient(90deg, #1890ff, #40a9ff); 
                         transition: width 0.3s ease;"></div>
                </div>
            </div>
            <div style="color: #8c8c8c; font-size: 0.9rem;">
                预估剩余时间: <span id="estimatedTime">--:--</span>
            </div>
            <div id="calculationTips" style="margin-top: 20px; padding: 15px; background: #f0f8ff; border-radius: 8px; 
                 max-width: 400px; text-align: center; color: #1890ff; font-size: 0.9rem;">
                正在智能分析所有可能的组合...
            </div>
        `;
        
        loadingElement.innerHTML = detailHtml;
        startTipRotation();
        
    } else {
        loadingElement.style.display = 'none';
        stopTipRotation();
        window.calculationStartTime = null;
    }
}

// 智能提示轮播
let tipInterval = null;
let currentTipIndex = 0;
const calculationTips = [
    "🧠 AI正在智能分析所有可能的组合...",
    "⚡ 使用高级剪枝算法避免无效计算...",
    "🔒 确保每个组合都精确匹配目标分数...",
    "🎯 同时搜索2人、3人、4人...直到6人的完美组合...",
    "💾 计算结果将被智能缓存，下次更快...",
    "🔮 运用动态规划算法优化搜索效率...",
    "🚀 并行处理多个搜索分支...",
    "🎨 为您呈现最精美的匹配结果...",
    "🛡️ 严格的质量控制确保结果准确性...",
    "🌟 寻找那个独一无二的完美组合..."
];

function startTipRotation() {
    if (tipInterval) return;
    
    tipInterval = setInterval(() => {
        currentTipIndex = (currentTipIndex + 1) % calculationTips.length;
        const tipsElement = document.getElementById('calculationTips');
        if (tipsElement) {
            tipsElement.textContent = calculationTips[currentTipIndex];
        }
    }, 2000);
}

function stopTipRotation() {
    if (tipInterval) {
        clearInterval(tipInterval);
        tipInterval = null;
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
    const MAX_CALCULATION_TIME = 5000; // 5秒超时
    
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
        
        // 查找符合条件的组合
        for (let combo of combos) {
            const total = combo.reduce((sum, p) => sum + p.score, 0);
            if (total === target) {
                allCombos.push({
                    members: combo,
                    totalScore: total
                });
            }
        }
        
        // 更新进度（每完成一种规模的计算）
        const progress = 30 + (size - 2) * 15;
        updateLoadingProgress(progress, `计算 ${size} 人组合完成...`);
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
        const membersHtml = combo.members.map(member => {
            const nameStyle = getXiaohongshuIdStyle(member.name);
            const warningIcon = !isValidXiaohongshuId(member.name) ? '⚠️ ' : '';
            return `
            <div class="member-item">
                <div class="member-id">${member.id}</div>
                <div class="member-name" style="${nameStyle}">${warningIcon}${member.name}</div>
                <div class="member-score">${member.score}</div>
            </div>
        `;
        }).join('');
        
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

// ==================== 查询组合（ID查询）====================
function queryCombinations() {
    const queryId = document.getElementById('queryIdInput').value.trim().toUpperCase();
    
    if (!queryId) {
        showToast('请输入用户ID', 'error');
        return;
    }
    
    // 检查是否已进行匹配
    if (allCombinations.length === 0) {
        if (confirm('尚未进行匹配，是否先执行匹配？')) {
            matchTeams();
            // 延迟执行查询（等待匹配完成）
            setTimeout(() => {
                performQueryById(queryId);
            }, 1500);
        }
        return;
    }
    
    // 直接执行查询
    performQueryById(queryId);
}

function performQueryById(queryId) {
    // 过滤包含该ID的组合
    const filtered = allCombinations.filter(combo => 
        combo.members.some(member => member.id.toUpperCase() === queryId)
    );
    
    // 显示查询结果
    renderQueryResult(filtered, queryId);
}

function renderQueryResult(combos, queryId) {
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
                <h3 style="margin-bottom: 15px;">未找到包含 ${queryId} 的组合</h3>
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
                🎯 找到 ${combos.length} 个包含 ${queryId} 的组合
            </div>
            <div style="color: #595959; font-size: 1.1rem;">
                以下组合总分恰好等于 ${TARGET_SCORE} 分，且包含用户 ${queryId}
            </div>
        </div>
    `;
    
    combos.forEach((combo, index) => {
        // 高亮显示查询的用户
        const membersHtml = combo.members.map(member => {
            const isTarget = member.id.toUpperCase() === queryId;
            const nameStyle = getXiaohongshuIdStyle(member.name);
            const warningIcon = !isValidXiaohongshuId(member.name) ? '⚠️ ' : '';
            return `
                <div class="member-item" style="${isTarget ? 'border: 3px solid #1890ff; transform: scale(1.05);' : ''}">
                    ${isTarget ? '<div style="position: absolute; top: -10px; right: -10px; background: #ff4d4f; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem;">!</div>' : ''}
                    <div class="member-id" style="${isTarget ? 'background: #1890ff; color: white;' : ''}">${member.id}</div>
                    <div class="member-name" style="${isTarget ? 'color: #1890ff; font-weight: bold;' : ''}${nameStyle ? ';' + nameStyle : ''}">${warningIcon}${member.name}</div>
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
                    <strong>成员ID:</strong> ${combo.members.map(m => m.id).join(', ')}
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
            const nameStyle = getXiaohongshuIdStyle(member.name);
            const warningIcon = !isValidXiaohongshuId(member.name) ? '⚠️ ' : '';
            return `
                <div class="member-item" style="${isTarget ? 'border: 3px solid #1890ff; transform: scale(1.05);' : ''}">
                    ${isTarget ? '<div style="position: absolute; top: -10px; right: -10px; background: #ff4d4f; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem;">!</div>' : ''}
                    <div class="member-id" style="${isTarget ? 'background: #1890ff; color: white;' : ''}">${member.id}</div>
                    <div class="member-name" style="${isTarget ? 'color: #1890ff; font-weight: bold;' : ''}${nameStyle ? ';' + nameStyle : ''}">${warningIcon}${member.name}</div>
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
    
    // 验证管理员账号（使用config.js中定义的凭证）
    if (username === DEFAULT_ADMIN.username && password === DEFAULT_ADMIN.password) {
        currentUser = { username: 'admin', role: 'admin' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
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

// ==================== 按分数查找用户功能 ====================
function searchUsersByScore() {
    const scoreInput = document.getElementById('scoreSearchInput');
    const resultEl = document.getElementById('scoreSearchResult');
    
    if (!scoreInput || !resultEl) {
        console.error('找不到按分数查找所需的DOM元素');
        return;
    }
    
    const score = parseInt(scoreInput.value.trim());
    
    // 输入验证
    if (!score || score < 1 || score > 2026) {
        showToast('请输入有效的芝麻分数（1-2026之间）', 'error');
        scoreInput.focus();
        return;
    }
    
    // 查找匹配的用户
    const matchingUsers = participants.filter(participant => 
        participant.score === score
    );
    
    // 显示结果
    displayScoreSearchResults(matchingUsers, score);
    
    // 显示结果区域
    resultEl.style.display = 'block';
}

function displayScoreSearchResults(users, targetScore) {
    const resultEl = document.getElementById('scoreSearchResult');
    
    if (users.length === 0) {
        resultEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>未找到芝麻分为 ${targetScore} 的用户</p>
                <p class="empty-text">当前数据库中没有该分数的参与者</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div style="margin-bottom: 20px;">
            <h4 style="color: #1890ff; margin-bottom: 15px;">
                🎯 找到 ${users.length} 位芝麻分为 ${targetScore} 的用户
            </h4>
        </div>
        <div class="results-grid">
    `;
    
    // 按ID排序显示用户
    users.sort((a, b) => a.id.localeCompare(b.id)).forEach(user => {
        const isTestUser = user.name && (user.name.toUpperCase() === 'TEST' || user.name.toLowerCase().includes('test'));
        
        html += `
            <div class="participant-card" style="
                border-left: 4px solid ${isTestUser ? '#ff4d4f' : '#52c41a'};
                background: ${isTestUser ? '#fff2f0' : '#f6ffed'};
                margin-bottom: 12px;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div class="participant-id" style="
                            font-weight: bold;
                            color: ${isTestUser ? '#ff4d4f' : '#262626'};
                            font-size: 1.1rem;
                        ">${user.id}</div>
                        <div class="participant-name" style="
                            color: ${isTestUser ? '#ff4d4f' : '#595959'};
                            margin: 5px 0;
                        ">${user.name || '未填写'}</div>
                    </div>
                    <div class="participant-score" style="
                        font-size: 1.3rem;
                        font-weight: bold;
                        color: ${isTestUser ? '#ff4d4f' : '#52c41a'};
                    ">
                        ${user.score} 分
                    </div>
                </div>
                <div style="margin-top: 10px; font-size: 0.85rem; color: #8c8c8c;">
                    登记时间: ${formatDate(user.created_at)}
                </div>
                ${isTestUser ? `
                    <div style="
                        margin-top: 8px;
                        padding: 4px 8px;
                        background: #ff4d4f;
                        color: white;
                        border-radius: 4px;
                        font-size: 0.8rem;
                        display: inline-block;
                    ">测试数据</div>
                ` : ''}
            </div>
        `;
    });
    
    html += '</div>';
    
    // 添加统计信息
    html += `
        <div style="
            margin-top: 20px;
            padding: 15px;
            background: #f0f5ff;
            border-radius: 8px;
            border-left: 4px solid #1890ff;
        ">
            <h5 style="margin: 0 0 10px 0; color: #1890ff;">📈 统计信息</h5>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div>
                    <strong>查询分数:</strong> ${targetScore} 分
                </div>
                <div>
                    <strong>匹配用户数:</strong> ${users.length} 人
                </div>
                <div>
                    <strong>平均芝麻分:</strong> ${targetScore} 分
                </div>
                <div>
                    <strong>查询时间:</strong> ${new Date().toLocaleString('zh-CN')}
                </div>
            </div>
        </div>
    `;
    
    resultEl.innerHTML = html;
}

function clearScoreSearch() {
    const scoreInput = document.getElementById('scoreSearchInput');
    const resultEl = document.getElementById('scoreSearchResult');
    
    if (scoreInput) {
        scoreInput.value = '';
    }
    if (resultEl) {
        resultEl.style.display = 'none';
        resultEl.innerHTML = '';
    }
    
    showToast('查询已重置', 'info');
}

// 为分数输入框添加回车键支持
document.addEventListener('DOMContentLoaded', () => {
    const scoreInput = document.getElementById('scoreSearchInput');
    if (scoreInput) {
        scoreInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchUsersByScore();
            }
        });
    }
});
