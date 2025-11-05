@echo off
REM ZenTao MCP Server 发布脚本 (Windows)
REM 使用方法: scripts\publish.bat [patch|minor|major]

echo 🚀 ZenTao MCP Server 发布流程
echo ================================

REM 检查是否在正确的目录
if not exist "package.json" (
    echo ❌ 错误: 请在项目根目录运行此脚本
    exit /b 1
)

REM 检查参数
set VERSION_TYPE=%1
if "%VERSION_TYPE%"=="" set VERSION_TYPE=patch
if not "%VERSION_TYPE%"=="patch" if not "%VERSION_TYPE%"=="minor" if not "%VERSION_TYPE%"=="major" (
    echo ❌ 错误: 版本类型必须是 patch, minor 或 major
    echo 用法: %0 [patch^|minor^|major]
    exit /b 1
)

echo 📦 版本类型: %VERSION_TYPE%

REM 1. 检查是否有未提交的更改
git status --porcelain >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  警告: 有未提交的更改
    set /p "CONTINUE=是否继续? (y/N): "
    if /i not "%CONTINUE%"=="y" (
        echo ❌ 发布取消
        exit /b 1
    )
    echo ✅ 继续发布...
)

REM 2. 运行测试
echo 🧪 运行测试...
npm test
if %errorlevel% neq 0 (
    echo ❌ 测试失败
    exit /b 1
)

REM 3. 构建项目
echo 🔨 构建项目...
npm run build
if %errorlevel% neq 0 (
    echo ❌ 构建失败
    exit /b 1
)

REM 4. 检查 npm 登录状态
echo 🔐 检查 npm 登录状态...
npm whoami >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 请先登录 npm: npm login
    exit /b 1
)

REM 5. 更新版本并发布
echo 📈 更新版本并发布...
if "%VERSION_TYPE%"=="patch" (
    npm run release:patch
) else if "%VERSION_TYPE%"=="minor" (
    npm run release:minor
) else if "%VERSION_TYPE%"=="major" (
    npm run release:major
)

if %errorlevel% neq 0 (
    echo ❌ 发布失败
    exit /b 1
)

echo ✅ 发布完成!
for /f "tokens=3" %%i in ('npm pkg get name') do set PACKAGE_NAME=%%i
set PACKAGE_NAME=%PACKAGE_NAME:"=%
for /f "tokens=3" %%i in ('npm pkg get version') do set PACKAGE_VERSION=%%i
set PACKAGE_VERSION=%PACKAGE_VERSION:"=%

echo 📦 包名: %PACKAGE_NAME%
echo 🏷️  版本: %PACKAGE_VERSION%
echo 🔗 npm 地址: https://www.npmjs.com/package/%PACKAGE_NAME%

echo.
echo 💡 使用说明:
echo    安装: npx %PACKAGE_NAME%
echo    或: npm install -g %PACKAGE_NAME%
echo    运行: %PACKAGE_NAME%