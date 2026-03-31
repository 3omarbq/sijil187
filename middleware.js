import { NextResponse } from 'next/server'

export const config = {
  matcher: ['/admin.html']
}

export default function middleware(request) {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL
  const token = request.cookies.get('sijil187_auth')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/?auth_required=1', request.url))
  }

  try {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('invalid')
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = '='.repeat((4 - b64.length % 4) % 4)
    const payload = JSON.parse(atob(b64 + pad))

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return NextResponse.redirect(new URL('/?auth_error=expired', request.url))
    }

    if (payload.email !== ADMIN_EMAIL) {
      return new NextResponse('غير مصرح', { status: 403 })
    }

    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/?auth_error=invalid', request.url))
  }
}
