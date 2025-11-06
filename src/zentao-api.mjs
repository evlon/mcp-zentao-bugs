// ZenTao API 模块
// 封装所有与禅道API相关的操作

export class ZenTaoAPI {
  constructor(baseUrl, account, password) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.account = account;
    this.password = password;
    this.token = '';
  }

  /**
   * 登录禅道获取Token
   */
  async login() {
    const url = `${this.baseUrl}/api.php/v1/tokens`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        account: this.account, 
        password: this.password 
      })
    });
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Login failed ${resp.status}: ${text}`);
    }
    
    const json = await resp.json();
    if (!json?.token) {
      throw new Error('Login response missing token');
    }
    
    this.token = json.token;
    return this.token;
  }

  /**
   * 获取认证头
   */
  getAuthHeaders() {
    return { 
      'Content-Type': 'application/json', 
      'Token': this.token 
    };
  }

  /**
   * 搜索产品
   * @param {string} keyword - 搜索关键词
   * @param {number} limit - 返回数量限制
   * @returns {Promise<Array>} 产品列表
   */
  async searchProducts(keyword, limit = 10) {
    const url = new URL(`${this.baseUrl}/api.php/v1/products`);
    url.searchParams.set('page', '1');
    url.searchParams.set('limit', '100');
    
    const resp = await fetch(url, { headers: this.getAuthHeaders() });
    if (!resp.ok) {
      throw new Error(`GET /products failed: ${resp.status}`);
    }
    
    const data = await resp.json();
    const list = Array.isArray(data.products) ? data.products : [];
    
    // 模糊搜索
    const filtered = list.filter(p => 
      String(p.name || '').toLowerCase().includes(keyword.toLowerCase())
    ).slice(0, limit);
    
    // 精简返回字段
    return filtered.map(p => ({
      id: p.id,
      name: p.name
    }));
  }

  /**
   * 搜索BUG
   * @param {number} productId - 产品ID
   * @param {Object} options - 搜索选项
   * @param {string} options.keyword - BUG标题关键词
   * @param {boolean} options.allStatuses - 是否返回所有状态
   * @param {number} options.limit - 返回数量限制
   * @returns {Promise<Array>} BUG列表
   */
  async searchBugs(productId, options = {}) {
    const { keyword = '', allStatuses = false, limit = 10 } = options;
    
    const url = new URL(`${this.baseUrl}/api.php/v1/products/${productId}/bugs`);
    url.searchParams.set('page', '1');
    url.searchParams.set('limit', '100');
    
    const resp = await fetch(url, { headers: this.getAuthHeaders() });
    if (!resp.ok) {
      throw new Error(`GET /products/${productId}/bugs failed: ${resp.status}`);
    }
    
    const data = await resp.json();
    let bugs = Array.isArray(data.bugs) ? data.bugs : [];
    
    // 默认只返回状态为"激活"的BUG
    if (!allStatuses) {
      bugs = bugs.filter(b => {
        const status = b.status?.name || b.status?.code || b.status;
        return status === 'active' || status === '激活' || status === 'Active';
      });
    }
    
    // 按标题关键词筛选
    if (keyword) {
      const kw = String(keyword).toLowerCase();
      bugs = bugs.filter(b => 
        String(b.title || '').toLowerCase().includes(kw)
      );
    }
    
    bugs = bugs.slice(0, limit);
    
    // 精简返回字段
    return bugs.map(b => ({
      id: b.id,
      title: b.title,
      severity: b.severity,
      status: b.status?.name || b.status?.code,
      assignedTo: b.assignedTo?.realname || b.assignedTo?.account
    }));
  }

  /**
   * 获取BUG详情
   * @param {number} bugId - BUG ID
   * @returns {Promise<Object>} BUG详情
   */
  async getBugDetail(bugId) {
    const resp = await fetch(
      `${this.baseUrl}/api.php/v1/bugs/${bugId}`, 
      { headers: this.getAuthHeaders() }
    );
    
    if (!resp.ok) {
      throw new Error(`GET /bugs/${bugId} failed: ${resp.status}`);
    }
    
    const bug = await resp.json();
    
    // 精简返回字段
    return {
      id: bug.id,
      title: bug.title,
      severity: bug.severity,
      priority: bug.pri,
      status: bug.status,
      steps: bug.steps,
      assignedTo: bug.assignedTo,
      openedBy: bug.openedBy,
      product: bug.product,
      type: bug.type
    };
  }

  /**
   * 标记BUG为已解决
   * @param {number} bugId - BUG ID
   * @param {string} comment - 解决备注
   * @returns {Promise<Object>} 操作结果
   */
  async markBugResolved(bugId, comment = '') {
    const body = { 
      resolution: 'fixed',
      ...(comment ? { comment: String(comment) } : {})
    };
    
    const resp = await fetch(
      `${this.baseUrl}/api.php/v1/bugs/${bugId}/resolve`,
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body)
      }
    );
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`POST /bugs/${bugId}/resolve failed: ${resp.status} ${text}`);
    }
    
    return await resp.json().catch(() => ({}));
  }

  /**
   * 智能搜索产品和BUG
   * @param {string} keyword - 产品搜索关键词
   * @param {Object} options - 搜索选项
   * @param {string} options.bugKeyword - BUG标题关键词
   * @param {number} options.productId - 直接指定产品ID
   * @param {boolean} options.allStatuses - 是否返回所有状态的BUG
   * @returns {Promise<Object>} 搜索结果
   */
  async searchProductBugs(keyword, options = {}) {
    const { bugKeyword = '', productId, allStatuses = false } = options;
    
    // 如果直接提供了 productId，直接搜索该产品的BUG
    if (productId) {
      if (!Number.isFinite(productId)) {
        throw new UserError('productId 必须为数字');
      }
      
      const bugs = await this.searchBugs(productId, {
        keyword: bugKeyword,
        allStatuses
      });
      
      return { bugs };
    }
    
    // 否则先搜索产品
    const products = await this.searchProducts(keyword);
    
    // 如果只找到1个产品，直接返回该产品的BUG列表
    if (products.length === 1) {
      const product = products[0];
      const bugs = await this.searchBugs(product.id, {
        keyword: bugKeyword,
        allStatuses
      });
      
      return { product, bugs };
    }
    
    // 找到多个产品或没有产品，返回产品列表供用户选择
    return { products };
  }
}