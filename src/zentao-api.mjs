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
   * 通过产品名称获取一个BUG的详情
   * @param {string} productName - 产品名称
   * @param {Object} options - 搜索选项
   * @param {string} options.keyword - BUG标题关键词，用于快速定位特定类型的BUG
   * @returns {Promise<Object>} BUG详情对象
   */
  async getBugByProductName(productName, options = {}) {
    const { keyword = '' } = options;
    
    // 1. 先搜索产品
    const products = await this.searchProducts(productName, 10);
    if (products.length === 0) {
      throw new Error(`未找到产品: ${productName}`);
    }
    
    // 2. 检查产品数量，如果多个产品需要用户选择
    if (products.length > 1) {
      const productList = products.map((p, index) => 
        `${index + 1}. ${p.name} (ID: ${p.id})`
      ).join('\n');
      
      throw new Error(`找到多个匹配的产品，请选择其中一个：\n${productList}\n\n请使用更精确的产品名称重新查询。`);
    }
    
    // 3. 使用唯一匹配的产品
    const product = products[0];
    
    // 4. 获取该产品的第一个指派给我的激活BUG
    const bug = await this.searchFirstActiveBug(product.id, {
      keyword,
      assignedToMe: true
    });
    
    if (!bug) {
      throw new Error(`产品 "${product.name}" 中没有指派给你的激活BUG${keyword ? `（关键词: ${keyword}）` : ''}`);
    }
    
    // 5. 获取BUG的完整详情
    const bugDetail = await this.getBugDetail(bug.id);
    
    return {
      bug: bugDetail,
      product: {
        id: product.id,
        name: product.name
      }
    };
  }

  /**
   * 搜索BUG
   * @param {number} productId - 产品ID（必需）
   * @param {Object} options - 搜索选项
   * @param {string} options.keyword - BUG标题关键词
   * @param {boolean} options.allStatuses - 是否返回所有状态
   * @param {number} options.limit - 返回数量限制
   * @param {boolean} options.assignedToMe - 是否只查询指派给我的BUG
   * @returns {Promise<Array>} BUG列表
   */
  async searchBugs(productId, options = {}) {
    const { keyword = '', allStatuses = false, limit = 10, assignedToMe = false } = options;
    
    // productId现在是必需参数，不再支持0表示所有产品
    
    // 注意：禅道API的分页问题是当超出最大页数时，返回的页码与请求的页码不一致
    // 我们需要逐页获取数据，直到获取足够的数据或到达最后一页
    let allBugs = [];
    let page = 1;
    const maxPages = 50; // 设置最大页数限制，防止无限循环
    
    while (allBugs.length < limit && page <= maxPages) {
      const url = new URL(`${this.baseUrl}/api.php/v1/products/${productId}/bugs`);
      url.searchParams.set('page', page.toString());
      url.searchParams.set('limit', '100'); // 每页100条数据
      
      // 如果只查询指派给我的BUG
      if (assignedToMe) {
        url.searchParams.set('status', 'assigntome');
      }
      
      const resp = await fetch(url, { headers: this.getAuthHeaders() });
      if (!resp.ok) {
        throw new Error(`GET /products/${productId}/bugs failed: ${resp.status}`);
      }
      
      const data = await resp.json();
      const bugs = Array.isArray(data.bugs) ? data.bugs : [];
      
      // 检查分页是否有效：如果返回的页码与请求的页码不一致，说明已超出最大页数
      if (data.page && data.page !== page) {
        break; // 已到达最后一页
      }
      
      // 如果当前页没有数据，说明已到最后一页
      if (bugs.length === 0) {
        break;
      }
      
      allBugs = allBugs.concat(bugs);
      
      // 如果当前页数据少于limit，说明已到最后一页
      if (bugs.length < 100) {
        break;
      }
      
      page++;
    }
    
    // 关键词过滤
    if (keyword) {
      allBugs = allBugs.filter(b => 
        String(b.title || '').toLowerCase().includes(keyword.toLowerCase())
      );
    }
    
    // 状态过滤
    if (!allStatuses) {
      allBugs = allBugs.filter(b => {
        const status = String(b.status || '').toLowerCase();
        // 处理status可能是对象或字符串的情况
        if (typeof b.status === 'object' && b.status.code) {
          return b.status.code.toLowerCase() === 'active';
        }
        return status === 'active';
      });
    }
    
    // 限制返回数量
    return allBugs.slice(0, limit);
  }

  /**
   * 使用 for yield 检索第一个激活的BUG
   * @param {number} productId - 产品ID
   * @param {Object} options - 搜索选项
   * @param {string} options.keyword - BUG标题关键词
   * @param {boolean} options.assignedToMe - 是否只查询指派给我的BUG
   * @returns {Promise<Object|null>} 第一个激活的BUG，如果没有则返回null
   */
  async* searchFirstActiveBugGenerator(productId, options = {}) {
    const { keyword = '', assignedToMe = false } = options;
    
    let page = 1;
    const maxPages = 50; // 最多搜索50页
    
    while (page <= maxPages) {
      const url = new URL(`${this.baseUrl}/api.php/v1/products/${productId}/bugs`);
      url.searchParams.set('page', page.toString());
      url.searchParams.set('limit', '50'); // 每页50条，减少流量
      
      // 如果只查询指派给我的BUG
      if (assignedToMe) {
        url.searchParams.set('status', 'assigntome');
      }
      
      const resp = await fetch(url, { headers: this.getAuthHeaders() });
      if (!resp.ok) {
        throw new Error(`GET /products/${productId}/bugs failed: ${resp.status}`);
      }
      
      const data = await resp.json();
      const bugs = Array.isArray(data.bugs) ? data.bugs : [];
      
      // 检查分页是否有效：如果返回的页码与请求的页码不一致，说明已超出最大页数
      if (data.page && data.page !== page) {
        break; // 已到达最后一页
      }
      
      if (bugs.length === 0) break; // 没有更多数据了
      
      // 如果当前页数据少于limit，说明已到最后一页
      if (bugs.length < 50) {
        // 处理完当前页的数据后退出
        for (const bug of bugs) {
          // 处理status可能是对象或字符串的情况
          let isActive = false;
          const status = bug.status;
          
          if (typeof status === 'object' && status.code) {
            isActive = status.code === 'active';
          } else {
            isActive = String(status || '').toLowerCase() === 'active';
          }
          
          if (isActive) {
            // 如果有关键词，检查标题是否匹配
            if (keyword) {
              const kw = String(keyword).toLowerCase();
              if (!String(bug.title || '').toLowerCase().includes(kw)) {
                continue;
              }
            }
            
            // yield 匹配的BUG
            yield {
              id: bug.id,
              title: bug.title,
              severity: bug.severity,
              status: bug.status,
              assignedTo: bug.assignedTo?.realname || bug.assignedTo?.account
            };
          }
        }
        break; // 最后一页处理完毕，退出循环
      }
      
      // yield 每一个激活的BUG
      for (const bug of bugs) {
        // 处理status可能是对象或字符串的情况
        let isActive = false;
        const status = bug.status;
        
        if (typeof status === 'object' && status.code) {
          isActive = status.code === 'active';
        } else {
          isActive = String(status || '').toLowerCase() === 'active';
        }
        
        if (isActive) {
          // 如果有关键词，检查标题是否匹配
          if (keyword) {
            const kw = String(keyword).toLowerCase();
            if (!String(bug.title || '').toLowerCase().includes(kw)) {
              continue;
            }
          }
          
          // yield 匹配的BUG
          yield {
            id: bug.id,
            title: bug.title,
            severity: bug.severity,
            status: bug.status,
            assignedTo: bug.assignedTo?.realname || bug.assignedTo?.account
          };
        }
      }
      
      page++;
    }
  }

  /**
   * 检索第一个激活的BUG（使用generator）
   * @param {number} productId - 产品ID
   * @param {Object} options - 搜索选项
   * @param {string} options.keyword - BUG标题关键词
   * @param {boolean} options.assignedToMe - 是否只查询指派给我的BUG
   * @returns {Promise<Object|null>} 第一个激活的BUG，如果没有则返回null
   */
  async searchFirstActiveBug(productId, options = {}) {
    const generator = this.searchFirstActiveBugGenerator(productId, options);
    
    for await (const bug of generator) {
      // 返回第一个匹配的BUG
      return bug;
    }
    
    return null; // 没有找到激活的BUG
  }

  /**
   * 检索BUG总数和第一页数据
   * @param {number} productId - 产品ID
   * @param {Object} options - 搜索选项
   * @param {string} options.keyword - BUG标题关键词
   * @param {boolean} options.activeOnly - 是否只统计激活的BUG
   * @param {boolean} options.assignedToMe - 是否只查询指派给我的BUG
   * @returns {Promise<Object>} 包含总数和第一页数据的对象
   */
  async searchBugsWithTotal(productId, options = {}) {
    const { keyword = '', activeOnly = false, assignedToMe = false } = options;
    
    const url = new URL(`${this.baseUrl}/api.php/v1/products/${productId}/bugs`);
    url.searchParams.set('page', '1');
    url.searchParams.set('limit', '20'); // 第一页只返回20条，用于预览
    
    // 如果只查询指派给我的BUG
    if (assignedToMe) {
      url.searchParams.set('status', 'assigntome');
    }
    
    const resp = await fetch(url, { headers: this.getAuthHeaders() });
    if (!resp.ok) {
      throw new Error(`GET /products/${productId}/bugs failed: ${resp.status}`);
    }
    
    const data = await resp.json();
    let bugs = Array.isArray(data.bugs) ? data.bugs : [];
    
    // 按标题关键词筛选
    if (keyword) {
      const kw = String(keyword).toLowerCase();
      bugs = bugs.filter(b => 
        String(b.title || '').toLowerCase().includes(kw)
      );
    }
    
    // 如果只需要激活的BUG，进行状态过滤
    let filteredBugs = bugs;
    if (activeOnly) {
      filteredBugs = bugs.filter(b => {
        const status = b.status;
        // 处理status可能是对象或字符串的情况
        if (typeof status === 'object' && status.code) {
          return status.code === 'active';
        }
        return String(status || '').toLowerCase() === 'active';
      });
    }
    
    // 使用API返回的total字段，如果需要过滤激活BUG，需要重新计算总数
    let total = data.total || 0;
    let filteredTotal = total;
    
    if ((activeOnly || keyword) && !assignedToMe) {
      // 如果需要过滤但不是指派给我的情况，需要重新计算总数
      filteredTotal = await this.calculateFilteredTotal(productId, { keyword, activeOnly });
    } else if (assignedToMe && (activeOnly || keyword)) {
      // 如果是指派给我的且需要其他过滤条件
      filteredTotal = await this.calculateFilteredTotal(productId, { keyword, activeOnly, assignedToMe });
    }
    
    return {
      total: filteredTotal,
      hasMore: filteredTotal > filteredBugs.length,
      bugs: filteredBugs.map(b => ({
        id: b.id,
        title: b.title,
        severity: b.severity,
        status: b.status,
        assignedTo: b.assignedTo?.realname || b.assignedTo?.account
      }))
    };
  }

  /**
   * 计算过滤后的总数（用于精确计算）
   * @param {number} productId - 产品ID
   * @param {Object} options - 过滤选项
   * @returns {Promise<number>} 过滤后的总数
   */
  async calculateFilteredTotal(productId, options = {}) {
    const { keyword = '', activeOnly = false, assignedToMe = false } = options;
    
    let page = 1;
    const maxPages = 50; // 最多检查50页来计算总数
    let totalCount = 0;
    
    while (page <= maxPages) {
      const url = new URL(`${this.baseUrl}/api.php/v1/products/${productId}/bugs`);
      url.searchParams.set('page', page.toString());
      url.searchParams.set('limit', '100');
      
      // 如果只查询指派给我的BUG
      if (assignedToMe) {
        url.searchParams.set('status', 'assigntome');
      }
      
      const resp = await fetch(url, { headers: this.getAuthHeaders() });
      if (!resp.ok) break;
      
      const data = await resp.json();
      const bugs = Array.isArray(data.bugs) ? data.bugs : [];
      
      // 检查分页是否有效：如果返回的页码与请求的页码不一致，说明已超出最大页数
      if (data.page && data.page !== page) {
        break; // 已到达最后一页
      }
      
      if (bugs.length === 0) break;
      
      // 应用过滤条件
      let filteredBugs = bugs;
      
      if (keyword) {
        const kw = String(keyword).toLowerCase();
        filteredBugs = filteredBugs.filter(b => 
          String(b.title || '').toLowerCase().includes(kw)
        );
      }
      
      if (activeOnly) {
        filteredBugs = filteredBugs.filter(b => {
          const status = b.status;
          if (typeof status === 'object' && status.code) {
            return status.code === 'active';
          }
          return String(status || '').toLowerCase() === 'active';
        });
      }
      
      totalCount += filteredBugs.length;
      
      // 如果当前页的数据少于limit，说明已经是最后一页
      if (bugs.length < 100) break;
      
      page++;
    }
    
    return totalCount;
  }

  /**
   * 从HTML内容中提取图片URL
   * @param {string} htmlContent - HTML内容
   * @returns {Array<string>} 图片URL数组
   */
  extractImagesFromHtml(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') {
      return [];
    }
    
    // 使用正则表达式匹配img标签的src属性
    const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    const images = [];
    let match;
    
    while ((match = imgRegex.exec(htmlContent)) !== null) {
      const src = match[1];
      if (src && src.startsWith('http')) {
        images.push(src);
      }
    }
    
    return images;
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
    
    // 从steps中提取图片
    const stepsImages = this.extractImagesFromHtml(bug.steps);
    
    // 精简返回字段
    return {
      id: bug.id,
      title: bug.title,
      severity: bug.severity,
      priority: bug.pri,
      status: bug.status,
      steps: bug.steps,
      stepsImages: stepsImages,
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
   * @param {boolean} options.assignedToMe - 是否只查询指派给我的BUG
   * @returns {Promise<Object>} 搜索结果
   */
  async searchProductBugs(keyword, options = {}) {
    const { bugKeyword = '', productId, allStatuses = false, assignedToMe = false } = options;
    
    // 如果直接提供了 productId，直接搜索该产品的BUG
    if (productId) {
      if (!Number.isFinite(productId)) {
        throw new UserError('productId 必须为数字');
      }
      
      const bugs = await this.searchBugs(productId, {
        keyword: bugKeyword,
        allStatuses,
        assignedToMe
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
        allStatuses,
        assignedToMe
      });
      
      return { product, bugs };
    }
    
    // 找到多个产品或没有产品，返回产品列表供用户选择
    return { products };
  }

  /**
   * 搜索所有产品的BUG
   * @param {Object} options - 搜索选项
   * @returns {Promise<Array>} BUG列表
   */
  async searchAllProductsBugs(options = {}) {
    const { keyword = '', allStatuses = false, limit = 10, assignedToMe = false } = options;
    
    // 获取所有产品
    const products = await this.searchProducts('', 50);
    let allBugs = [];
    
    // 遍历所有产品获取BUG
    for (const product of products) {
      try {
        const bugs = await this.searchBugs(product.id, {
          keyword,
          allStatuses,
          limit: Math.ceil(limit / products.length) + 5, // 分配limit，避免总数不够
          assignedToMe
        });
        
        // 添加产品信息到每个BUG
        const bugsWithProduct = bugs.map(bug => ({
          ...bug,
          product: { id: product.id, name: product.name }
        }));
        
        allBugs = allBugs.concat(bugsWithProduct);
      } catch (err) {
        // 如果某个产品查询失败，跳过继续查询其他产品
        console.warn(`Failed to search bugs for product ${product.id}: ${err.message}`);
      }
    }
    
    // 按优先级或时间排序（这里可以按需要调整）
    allBugs.sort((a, b) => {
      // 可以按severity、openedDate等排序
      return (b.severity || 0) - (a.severity || 0);
    });
    
    return allBugs.slice(0, limit);
  }
}