// ==================== 全局变量 ====================
let adminUser = null;

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    // 检查 Supabase 是否就绪
    if (!isSupabaseReady()) {
        alert('❌ 数据库未连接！请返回首页检查 config.js 配置');
        window.location.href = 'index.html';
        return;
    }
    
    // 检查管理员登录状态
    checkAdminLogin();
    
    if (!adminUser) {
        window.location.href = 'index.html';
        return;
    }
    
    // 加载数据
    await loadDashboardData();
    await loadParticipantsTable();
    await loadAuditLog();
    
    // 检查数据库连接
    checkDatabaseConnection();
});

function checkAdminLogin() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        if (user.role === 'admin') {
            adminUser = user;
            document.getElementById('adminUserStatus').textContent = `👤 ${user.username}`;
            return;
        }
    }
    
    // 未登录或非管理员，跳转到首页
    window.location.href = 'index.html';
}

// ==================== 数据加载 ====================
async function loadDashboardData() {
    try {
        // 加载参与者总数
        const { count: participantCount, error: pError } = await supabaseClient
            .from('participants')
            .select('*', { count: 'exact', head: true });
        
        if (!pError) {
            document.getElementById('totalParticipants').textContent = participantCount || 0;
        }
        
        // 加载审计日志总数
        const { count: auditCount, error: aError } = await supabaseClient
            .from('audit_log')
            .select('*', { count: 'exact', head: true });
        
        if (!aError) {
            document.getElementById('totalDeleted').textContent = auditCount || 0;
        }
        
        // 加载用户总数（这里简化为1个管理员）
        document.getElementById('totalUsers').textContent = '1';
        
        // 计算有效组合数
        const { data: participantsData, error: pDataError } = await supabaseClient
            .from('participants')
            .select('*');
        
        if (!pDataError && participantsData) {
            const combos = findAllPerfectCombinations(participantsData, TARGET_SCORE);
            document.getElementById('totalCombinations').textContent = combos.length;
        }
    } catch (error) {
        console.error('加载仪表盘数据失败:', error);
        document.getElementById('dbStatus').className = 'status-badge status-error';
        document.getElementById('dbStatus').textContent = '❌ 加载失败';
    }
}

async function loadParticipantsTable() {
    try {
        const { data, error } = await supabaseClient
            .from('participants')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        renderParticipantsTable(data || []);
    } catch (error) {
        console.error('加载参与者表格失败:', error);
        showToast('加载参与者数据失败: ' + (error.message || '请检查数据库'), 'error');
    }
}

function renderParticipantsTable(data) {
    const tbody = document.getElementById('participantsTableBody');
    
    if (data.length === 0) {
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
    
    tbody.innerHTML = data.map(p => `
        <tr>
            <td><input type="checkbox" class="row-checkbox" value="${p.id}"></td>
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

async function loadAuditLog() {
    try {
        const { data, error } = await supabaseClient
            .from('audit_log')
            .select('*')
            .order('deleted_at', { ascending: false });
        
        if (error) throw error;
        
        renderAuditLogTable(data || []);
    } catch (error) {
        console.error('加载审计日志失败:', error);
        showToast('加载审计日志失败', 'error');
    }
}

function renderAuditLogTable(data) {
    const tbody = document.getElementById('auditLogTableBody');
    
    if (data.length === 0) {
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
    
    tbody.innerHTML = data.map(log => `
        <tr>
            <td>${log.participant_id}</td>
            <td>${log.participant_name}</td>
            <td>${log.delete_reason}</td>
            <td>${formatDate(log.deleted_at)}</td>
        </tr>
    `).join('');
}

// ==================== 数据库连接检查 ====================
async function checkDatabaseConnection() {
    try {
        const { data, error } = await supabaseClient
            .from('participants')
            .select('id')
            .limit(1);
        
        if (error) throw error;
        
        document.getElementById('dbStatus').className = 'status-badge status-success';
        document.getElementById('dbStatus').textContent = '✅ 连接正常';
    } catch (error) {
        console.error('数据库连接失败:', error);
        document.getElementById('dbStatus').className = 'status-badge status-error';
        document.getElementById('dbStatus').textContent = '❌ 连接失败: ' + (error.message || '未知错误');
    }
}

// ==================== 工具函数 ====================
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

// ==================== 管理员操作 ====================
async function deleteParticipant(id, name) {
    if (!confirm(`确定要删除 ${name} (${id}) 吗？\n\n注意：此操作将记录到审计日志，不可恢复！`)) {
        return;
    }
    
    const reason = prompt('请输入删除原因（至少5个字）：');
    if (!reason || reason.length < 5) {
        alert('删除原因至少需要5个字');
        return;
    }
    
    try {
        // 记录审计日志
        const { data: participantData, error: fetchError } = await supabaseClient
            .from('participants')
            .select('*')
            .eq('id', id)
            .single();
        
        if (fetchError) throw fetchError;
        if (!participantData) throw new Error('未找到该参与者');
        
        const { error: logError } = await supabaseClient.from('audit_log').insert([{
            participant_id: participantData.id,
            participant_name: participantData.name,
            participant_score: participantData.score,
            delete_reason: reason,
            deleted_at: new Date().toISOString()
        }]);
        
        if (logError) throw logError;
        
        // 删除参与者
        const { error: delError } = await supabaseClient
            .from('participants')
            .delete()
            .eq('id', id);
        
        if (delError) throw delError;
        
        showToast(`✅ ${name} 已删除\n📝 原因: ${reason}`);
        
        // 重新加载数据
        await loadParticipantsTable();
        await loadDashboardData();
        await loadAuditLog();
    } catch (error) {
        console.error('删除失败:', error);
        showToast('删除失败: ' + (error.message || '请重试'), 'error');
    }
}

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    const selectAll = document.getElementById('selectAll').checked;
    checkboxes.forEach(cb => cb.checked = selectAll);
}

async function bulkDelete() {
    const checked = document.querySelectorAll('.row-checkbox:checked');
    if (checked.length === 0) {
        alert('请先选择要删除的参与者');
        return;
    }
    
    if (!confirm(`确定要批量删除选中的 ${checked.length} 个参与者吗？`)) {
        return;
    }
    
    const reason = prompt('请输入批量删除原因（至少5个字）：');
    if (!reason || reason.length < 5) {
        alert('删除原因至少需要5个字');
        return;
    }
    
    try {
        let successCount = 0;
        
        for (const checkbox of checked) {
            const id = checkbox.value;
            
            // 记录审计日志
            const { data: participantData, error: fetchError } = await supabaseClient
                .from('participants')
                .select('*')
                .eq('id', id)
                .single();
            
            if (fetchError || !participantData) continue;
            
            await supabaseClient.from('audit_log').insert([{
                participant_id: participantData.id,
                participant_name: participantData.name,
                participant_score: participantData.score,
                delete_reason: reason,
                deleted_at: new Date().toISOString()
            }]);
            
            // 删除参与者
            await supabaseClient
                .from('participants')
                .delete()
                .eq('id', id);
            
            successCount++;
        }
        
        showToast(`✅ 批量删除完成（${successCount}/${checked.length} 个）\n📝 原因: ${reason}`);
        
        // 重新加载数据
        await loadParticipantsTable();
        await loadDashboardData();
        await loadAuditLog();
    } catch (error) {
        console.error('批量删除失败:', error);
        showToast('批量删除失败: ' + (error.message || '请重试'), 'error');
    }
}

function clearLocalStorage() {
    if (confirm('确定要清除本地缓存吗？\n这不会影响云端数据。')) {
        localStorage.clear();
        showToast('✅ 本地缓存已清除');
    }
}

async function exportAllData() {
    try {
        // 加载所有数据
        const { data: participantsData, error: pError } = await supabaseClient
            .from('participants')
            .select('*');
        
        const { data: auditLogData, error: aError } = await supabaseClient
            .from('audit_log')
            .select('*');
        
        if (pError || aError) {
            throw new Error('数据加载失败');
        }
        
        const exportData = {
            exportTime: new Date().toISOString(),
            participants: participantsData || [],
            auditLog: auditLogData || [],
            totalParticipants: participantsData?.length || 0,
            totalDeleted: auditLogData?.length || 0,
            targetScore: TARGET_SCORE
        };
        
        // 生成JSON文件
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        
        const link = document.createElement('a');
        link.setAttribute('href', dataUri);
        link.setAttribute('download', `sesame_export_${new Date().toISOString().slice(0,10)}.json`);
        link.click();
        
        showToast(`✅ 数据导出成功\n- 参与者: ${exportData.totalParticipants} 人\n- 删除记录: ${exportData.totalDeleted} 条`);
    } catch (error) {
        console.error('导出数据失败:', error);
        showToast('导出失败: ' + (error.message || '请重试'), 'error');
    }
}

// ==================== 退出登录 ====================
function logout() {
    adminUser = null;
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}
