/**
 * 三数之和匹配算法 - Web Worker
 * 使用双指针优化，时间复杂度 O(n²)
 */

// 监听主线程消息
self.onmessage = function(e) {
    const { participants, targetScore, requestId } = e.data;
    
    console.log(`[Worker] 开始计算，参与者: ${participants.length}人，目标分数: ${targetScore}`);
    
    const startTime = performance.now();
    const results = findTripleCombinations(participants, targetScore, (progress, message) => {
        // 发送进度更新
        self.postMessage({
            type: 'progress',
            requestId,
            progress,
            message
        });
    });
    
    const endTime = performance.now();
    
    console.log(`[Worker] 计算完成，找到 ${results.length} 个组合，耗时: ${(endTime - startTime).toFixed(2)}ms`);
    
    // 发送最终结果
    self.postMessage({
        type: 'complete',
        requestId,
        results,
        duration: endTime - startTime
    });
};

/**
 * 双指针法查找三数之和等于目标值的所有组合
 * @param {Array} participants - 参与者数组 [{id, name, score}]
 * @param {number} target - 目标分数 (2026)
 * @param {Function} onProgress - 进度回调
 * @returns {Array} 匹配的组合数组
 */
function findTripleCombinations(participants, target, onProgress) {
    const n = participants.length;
    const results = [];
    
    // 边界检查
    if (n < 3) return results;
    
    // 创建带索引的副本用于排序
    const indexedParticipants = participants.map((p, idx) => ({
        ...p,
        originalIndex: idx
    }));
    
    // 按分数升序排序
    indexedParticipants.sort((a, b) => a.score - b.score);
    
    // 提前终止：最小三数之和 > target 或 最大三数之和 < target
    const minSum = indexedParticipants[0].score + indexedParticipants[1].score + indexedParticipants[2].score;
    const maxSum = indexedParticipants[n-1].score + indexedParticipants[n-2].score + indexedParticipants[n-3].score;
    
    if (minSum > target || maxSum < target) {
        onProgress(100, '无可行组合');
        return results;
    }
    
    // 双指针查找
    for (let i = 0; i < n - 2; i++) {
        // 跳过重复的score（去重优化）
        if (i > 0 && indexedParticipants[i].score === indexedParticipants[i-1].score) {
            continue;
        }
        
        // 剪枝1：当前最小三数之和 > target，后面都更大
        const currentMinSum = indexedParticipants[i].score + indexedParticipants[i+1].score + indexedParticipants[i+2].score;
        if (currentMinSum > target) break;
        
        // 剪枝2：当前最大三数之和 < target，当前i不可能
        const currentMaxSum = indexedParticipants[i].score + indexedParticipants[n-2].score + indexedParticipants[n-1].score;
        if (currentMaxSum < target) continue;
        
        // 双指针
        let left = i + 1;
        let right = n - 1;
        
        while (left < right) {
            const sum = indexedParticipants[i].score + indexedParticipants[left].score + indexedParticipants[right].score;
            
            if (sum === target) {
                // 找到匹配组合
                results.push({
                    members: [
                        { ...indexedParticipants[i] },
                        { ...indexedParticipants[left] },
                        { ...indexedParticipants[right] }
                    ],
                    totalScore: target
                });
                
                // 跳过left的重复元素
                while (left < right && indexedParticipants[left].score === indexedParticipants[left + 1].score) {
                    left++;
                }
                // 跳过right的重复元素
                while (left < right && indexedParticipants[right].score === indexedParticipants[right - 1].score) {
                    right--;
                }
                
                left++;
                right--;
            } else if (sum < target) {
                // 需要更大的数
                left++;
            } else {
                // 需要更小的数
                right--;
            }
        }
        
        // 每处理10%发送一次进度
        if (i % Math.ceil(n / 10) === 0) {
            const progress = Math.min(95, Math.floor((i / (n - 2)) * 100));
            onProgress(progress, `正在计算组合... (${results.length}个已找到)`);
        }
    }
    
    onProgress(100, `计算完成，找到 ${results.length} 个组合`);
    return results;
}