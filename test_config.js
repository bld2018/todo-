
// 测试config.js
const fs = require('fs');
const configContent = fs.readFileSync('config.js', 'utf8');

// 创建一个函数来执行配置
function loadConfig() {
    eval(configContent);
    return { DEFAULT_ADMIN, AdvancedCombinationOptimizer };
}

try {
    const config = loadConfig();
    console.log('DEFAULT_ADMIN defined:', typeof config.DEFAULT_ADMIN !== 'undefined');
    if (config.DEFAULT_ADMIN) {
        console.log('Username:', config.DEFAULT_ADMIN.username);
        console.log('Password:', config.DEFAULT_ADMIN.password);
    }
    console.log('AdvancedCombinationOptimizer defined:', typeof config.AdvancedCombinationOptimizer !== 'undefined');
} catch (error) {
    console.log('Error:', error.message);
}

