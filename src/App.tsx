import './App.css'

type Site = {
  id: string
  title: string
  url: string
  description?: string
}

const sites: Site[] = [
  { id: '1', title: '1', url: 'https://2dfan.com', description: 'フォーラム' },
  { id: '2', title: '2', url: 'https://www.bilinovel.com', description: 'bilibili novel' },
  { id: '3', title: '3', url: 'https://n.novelia.cc', description: '機械翻訳' },
  { id: '4', title: '4', url: 'https://www.esjzone.cc/', description: 'esj' },

]

const novels: Site[] = [
  { id: 'n1', title: '1', url: 'https://n.novelia.cc/novel/kakuyomu/16818792436355768559', description: '1' },
  { id: 'n2', title: '2', url: 'https://www.esjzone.cc/detail/1734874133.html', description: '2' },
]

export default function App() {
  return (
    <div className="page-root">
      <header className="profile">
        <div className="profile-info centered">
          <h1 className="name">コレクション</h1>
        </div>
      </header>

      <main className="content">
        <section className="sites-section">
          <h2 className="section-title">サイト</h2>
          <ul className="sites-list">
            {sites.map((s) => (
              <li key={s.id} className="site-row">
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  <span className="site-desc">{s.description ?? s.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
        
        <section className="sites-section">
          <h2 className="section-title">ライトノベル</h2>
          <ul className="sites-list">
            {novels.map((n) => (
              <li key={n.id} className="site-row">
                <a href={n.url} target="_blank" rel="noopener noreferrer">
                  <span className="site-desc">{n.description ?? n.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="page-footer">
        <div className="footer-center">
          <div>© {new Date().getFullYear()} <span className="footer-name">コレクション</span></div>
        </div>
      </footer>
    </div>
  )
}
