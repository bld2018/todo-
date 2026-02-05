// ==================== Supabase 配置 ====================
// ⚠️ 部署前请替换为您的 Supabase 项目配置

// 1. 替换为您的 Supabase 项目 URL（格式：https://xxxxx.supabase.co）
const SUPABASE_URL = 'https://xinqzxrulxtermoifija.supabase.co';

// 2. 替换为您的 anon public key（在 Project Settings → API 中获取）
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpbnF6eHJ1bHh0ZXJtb2lmaWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTIzNjMsImV4cCI6MjA4NTY4ODM2M30.0WidJmYQb8T8KxsFu7MapM-WCGs90hWH0ypPII1CvfA';

// 3. 创建 Supabase 客户端（使用全局 supabase 命名空间，避免重复声明）
let supabaseClient = null;

// 确保在浏览器环境中才创建客户端
if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase 客户端创建成功');
    } catch (error) {
        console.error('❌ 创建Supabase客户端时出错:', error);
        supabaseClient = null;
    }
} else {
    console.error('❌ Supabase SDK 未加载，请检查 script 标签');
    console.log('window.supabase存在:', typeof window.supabase !== 'undefined');
    console.log('window.supabase.createClient存在:', typeof window.supabase?.createClient !== 'undefined');
    // 创建一个假的客户端对象防止报错
    supabaseClient = {
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
            insert: () => Promise.resolve({ data: [], error: null }),
            update: () => Promise.resolve({ data: [], error: null }),
            delete: () => Promise.resolve({ data: [], error: null })
        }),
        rpc: () => Promise.resolve({ data: [], error: null })
    };
}

// 4. 全局配置
const DEFAULT_ADMIN = {
    username: 'admin',
    password: 'luo2026...'
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
    if (window.showToast) {
        // 如果app.js中有实现，则调用它
        window.showToast(message, type);
    } else {
        // 否则使用alert作为备选
        if (type === 'error') {
            alert('❌ ' + message);
        } else {
            alert('✅ ' + message);
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

// 6. 检查 Supabase 是否就绪
function isSupabaseReady() {
    if (!supabaseClient) {
        console.log('❌ Supabase客户端未定义');
        return false;
    }
    
    if (typeof supabaseClient.from !== 'function') {
        console.log('❌ Supabase客户端from方法不存在');
        return false;
    }
    
    if (typeof supabaseClient.rpc !== 'function') {
        console.log('❌ Supabase客户端rpc方法不存在');
        return false;
    }
    
    console.log('✅ Supabase客户端就绪');
    return true;
}

// 7. 初始化检查
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        if (isSupabaseReady()) {
            console.log('✅ Supabase 客户端初始化成功');
        } else {
            console.error('❌ Supabase 初始化失败');
            console.log('SUPABASE_URL:', SUPABASE_URL ? '已设置' : '未设置');
            console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '已设置' : '未设置');
            console.log('window.supabase存在:', typeof window.supabase !== 'undefined');
            console.log('window.supabase.createClient存在:', typeof window.supabase?.createClient !== 'undefined');
            alert('数据库配置错误！请检查 config.js 中的 SUPABASE_URL 和 SUPABASE_ANON_KEY');
        }
    });
}

// ==================== 并发控制和队列管理 ====================
class RequestQueue {
    constructor(maxConcurrent = 3, queueLimit = 10) {
        this.maxConcurrent = maxConcurrent;  // 最大并发数
        this.queueLimit = queueLimit;        // 队列最大长度
        this.queue = [];                     // 请求队列
        this.running = 0;                    // 正在执行的任务数
        this.requestId = 0;                  // 请求ID计数器
    }
    
    // 添加请求到队列
    async add(requestFn, priority = 0) {
        // 检查队列是否已满
        if (this.queue.length >= this.queueLimit) {
            throw new Error('系统繁忙，请稍后再试');
        }
        
        return new Promise((resolve, reject) => {
            const requestId = ++this.requestId;
            
            // 创建请求对象
            const request = {
                id: requestId,
                fn: requestFn,
                priority: priority,
                resolve: resolve,
                reject: reject,
                timestamp: Date.now()
            };
            
            // 按优先级插入队列
            this.insertIntoQueue(request);
            
            // 尝试执行队列
            this.processQueue();
        });
    }
    
    // 按优先级插入队列
    insertIntoQueue(request) {
        let insertIndex = this.queue.length;
        for (let i = 0; i < this.queue.length; i++) {
            if (this.queue[i].priority < request.priority) {
                insertIndex = i;
                break;
            }
        }
        this.queue.splice(insertIndex, 0, request);
    }
    
    // 处理队列
    async processQueue() {
        // 如果达到最大并发数，等待
        if (this.running >= this.maxConcurrent) {
            return;
        }
        
        // 如果队列为空，直接返回
        if (this.queue.length === 0) {
            return;
        }
        
        // 取出队列中的第一个请求
        const request = this.queue.shift();
        this.running++;
        
        try {
            // 执行请求
            const result = await request.fn();
            request.resolve(result);
        } catch (error) {
            request.reject(error);
        } finally {
            this.running--;
            // 继续处理队列
            this.processQueue();
        }
    }
    
    // 获取队列状态
    getStatus() {
        return {
            queueLength: this.queue.length,
            running: this.running,
            maxConcurrent: this.maxConcurrent,
            queueLimit: this.queueLimit
        };
    }
    
    // 清空队列
    clear() {
        this.queue = [];
        this.running = 0;
    }
}

// 全局请求队列实例
const globalRequestQueue = new RequestQueue(2, 15); // 限制2个并发，队列长度15

// ==================== 速率限制器 ====================
class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;    // 时间窗口内最大请求数
        this.timeWindow = timeWindow;      // 时间窗口（毫秒）
        this.requests = [];                // 请求时间戳数组
    }
    
    // 检查是否允许请求
    async checkAndProceed(requestFn) {
        const now = Date.now();
        
        // 清理过期的请求记录
        this.requests = this.requests.filter(timestamp => 
            now - timestamp < this.timeWindow
        );
        
        // 检查是否超过限制
        if (this.requests.length >= this.maxRequests) {
            const waitTime = this.timeWindow - (now - this.requests[0]);
            throw new Error(`请求过于频繁，请等待 ${Math.ceil(waitTime/1000)} 秒后重试`);
        }
        
        // 记录当前请求
        this.requests.push(now);
        
        // 执行请求
        return await requestFn();
    }
}

// 全局速率限制器实例 - 每分钟最多30次请求
const globalRateLimiter = new RateLimiter(30, 60000);

// ==================== 加载状态管理 ====================
class LoadingManager {
    constructor() {
        this.loadingCount = 0;
        this.loadingElement = null;
        this.statusText = '';
    }
    
    // 显示加载状态
    show(message = '数据加载中...', progress = 0) {
        this.loadingCount++;
        
        if (!this.loadingElement) {
            this.loadingElement = document.getElementById('globalLoadingIndicator');
        }
        
        if (this.loadingElement) {
            this.loadingElement.style.display = 'flex';
            const textElement = document.getElementById('loadingText');
            const progressBar = document.getElementById('progressBar');
            
            if (textElement) {
                textElement.textContent = message;
            }
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
        }
    }
    
    // 隐藏加载状态
    hide() {
        this.loadingCount = Math.max(0, this.loadingCount - 1);
        if (this.loadingCount === 0 && this.loadingElement) {
            this.loadingElement.style.display = 'none';
        }
    }
    
    // 更新进度
    updateProgress(progress, message) {
        if (this.loadingElement) {
            const textElement = document.getElementById('loadingText');
            const progressBar = document.getElementById('progressBar');
            
            if (textElement && message) {
                textElement.textContent = message;
            }
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
        }
    }
}

// 全局加载管理器实例
const globalLoadingManager = new LoadingManager();

// ==================== 队列状态显示 ====================
function showQueueStatus() {
    const status = globalRequestQueue.getStatus();
    if (status.queueLength > 0) {
        showToast(`📋 系统繁忙，前方还有 ${status.queueLength} 个请求在排队...`, 'info');
    }
}

// ==================== 智能重试机制 ====================
async function smartRetry(operation, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            console.warn(`第 ${attempt} 次尝试失败:`, error.message);
            
            // 如果是最后一次尝试，抛出错误
            if (attempt === maxRetries) {
                throw error;
            }
            
            // 指数退避延迟
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}