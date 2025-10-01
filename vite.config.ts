import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
// 在某些编辑器/TS 配置下会对 Node 全局类型警告（例如 process、url），
// 推荐方案是安装 `@types/node` 并在 tsconfig 中加入 types: ["node"]，下面用最小的兼容写法。
// import { fileURLToPath } from 'url' // Removed Node-only import

// 自动根据环境设置 base 路径（支持 GitHub Pages）
function readGithubPagesFlag(): boolean {
  try {
    // 在大多数 Node/Vite 运行时，globalThis.process.env 可用；我们做一次安全读取
    // 使用索引访问避免对 process 的静态类型依赖
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (globalThis as any).process
    return !!(p && p.env && p.env['GITHUB_PAGES'] === 'true')
  } catch {
    return false
  }
}

const isGithubPages = readGithubPagesFlag()
const base = isGithubPages ? '/korekushon/' : '/'

// 使用 ESM friendly 的方式生成绝对路径（将 import.meta 断言为 any 以避免部分编辑器警告）
// const __importMeta: any = import.meta
const assetsPath = '/src/assets' // Use root-relative alias for assets

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@assets': assetsPath
    }
  },
  base,
  build: {
    sourcemap: false,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[ext]' // 确保图片/音频等静态资源路径正确
      }
    }
  }
})
