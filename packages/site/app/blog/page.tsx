import Link from 'next/link'
import { getAllPosts } from '@/lib/blog'
import { Logo } from '@/components/landing/Logo'
import Footer from '@/components/landing/Footer'
import { ThemeToggle } from '@/components/ThemeToggle'

function GithubIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

export const metadata = {
  title: 'Blog — MotionScript',
  description: 'News, release notes, and updates from the Motion Script team.',
}

export default function BlogListPage() {
  const posts = getAllPosts()

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 sm:gap-6 px-4 h-14">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Logo className="h-5 w-5 text-foreground" />
            <span className="font-serif text-base text-foreground flex items-center">
              <span className="font-thin scale-90 inline-block">Motion</span>
              <span className="font-code font-medium">Script</span>
            </span>
          </Link>

          <div className="flex items-center gap-0.5 sm:gap-1 text-sm">
            <Link href="/docs/intro" className="px-2 sm:px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              Docs
            </Link>
            <Link href="/api/core" className="px-2 sm:px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
              API
            </Link>
            <Link href="/blog" className="px-2 sm:px-3 py-1.5 rounded-md text-foreground font-medium bg-foreground/5">
              Blog
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <a
              href="https://github.com/motion-script/motion-script"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/5 transition-colors"
            >
              <GithubIcon className="h-4 w-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <h1 className="text-3xl font-serif font-normal text-foreground mb-2">Blog</h1>
        <p className="text-muted-foreground mb-12">News, release notes, and updates from the Motion Script team.</p>

        {posts.length === 0 ? (
          <p className="text-muted-foreground">No posts yet.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {posts.map((post) => (
              <article key={post.meta.slug} className="border-b border-border pb-10 last:border-0">
                <Link href={`/blog/${post.meta.slug}`} className="no-underline hover:no-underline group">
                  <h2 className="text-xl font-semibold text-foreground group-hover:text-foreground/80 transition-colors mb-1">
                    {post.meta.title}
                  </h2>
                </Link>

                <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                  <time>{post.meta.date}</time>
                  {post.meta.authors.length > 0 && (
                    <>
                      <span>·</span>
                      <div className="flex items-center gap-1.5">
                        {post.meta.authors.map((a) =>
                          a.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={a.name}
                              src={a.image_url}
                              alt={a.name}
                              width={20}
                              height={20}
                              className="rounded-full object-cover"
                            />
                          ) : null,
                        )}
                        <span>{post.meta.authors.map((a) => a.name).join(', ')}</span>
                      </div>
                    </>
                  )}
                </div>

                {post.meta.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {post.meta.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs rounded-full bg-foreground/8 text-muted-foreground capitalize"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-muted-foreground text-sm leading-relaxed mb-4">{post.excerpt}</p>

                <Link
                  href={`/blog/${post.meta.slug}`}
                  className="text-sm text-foreground hover:text-foreground/70 transition-colors no-underline hover:no-underline font-medium"
                >
                  Read more →
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
