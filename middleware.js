export const config = {
  matcher: ['/admin.html', '/admin', '/admin/:path*']
}

function decodeJWTPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(atob(b64 + pad))
  } catch {
    return null
  }
}

function forbiddenPage() {
  return new Response(
    `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>403 — غير مصرح</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#070707;color:#e0e0e0;font-family:Arial,sans-serif;
     height:100vh;display:flex;flex-direction:column;
     align-items:center;justify-content:center;gap:1rem}
.code{font-size:7rem;font-weight:900;color:#8b0000}
.msg{color:#777}
a{color:#c0392b;text-decoration:none;border:1px solid #c0392b;
  padding:.5rem 1.5rem;border-radius:4px}
a:hover{background:#c0392b;color:#fff}
</style>
</head>
<body>
<div class="code">403</div>
<div class="msg">ليس لديك صلاحية الدخول</div>
<a href="/">العودة للموقع</a>
</body>
</html>`,
    { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export default async function middleware(request) {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL

  if (!ADMIN_EMAIL) return forbiddenPage()

  const tokenCookie = request.cookies.get('sijil187_auth')

  if (!tokenCookie?.value) {
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('auth_required', '1')
    return Response.redirect(loginUrl, 302)
  }

  const payload = decodeJWTPayload(tokenCookie.value)

  if (!payload) {
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('auth_error', 'invalid_token')
    return Response.redirect(loginUrl, 302)
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('auth_error', 'session_expired')
    return Response.redirect(loginUrl, 302)
  }

  if (payload.email !== ADMIN_EMAIL) return forbiddenPage()
}
