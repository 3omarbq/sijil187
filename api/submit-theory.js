const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const N8N_WEBHOOK    = process.env.N8N_WEBHOOK_URL
const ALLOWED_ORIGIN = 'https://sijil187.vercel.app'

const rateMap = new Map()
const RATE_LIMIT  = 3
const RATE_WINDOW = 60 * 60 * 1000

function checkRate(key) {
  const now = Date.now()
  const rec = rateMap.get(key) || { count: 0, start: now }
  if (now - rec.start > RATE_WINDOW) {
    rateMap.set(key, { count: 1, start: now })
    return true
  }
  if (rec.count >= RATE_LIMIT) return false
  rec.count++
  rateMap.set(key, rec)
  return true
}

async function getUser(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_KEY
    }
  })
  return r.ok ? r.json() : null
}

async function isBlocked(userId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/blocked_users?user_id=eq.${userId}&select=id&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  )
  if (!r.ok) return false
  const d = await r.json()
  return d.length > 0
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' })

  const token = authHeader.slice(7)
  const user  = await getUser(token)

  if (!user?.id)
    return res.status(401).json({ error: 'جلسة منتهية. أعد تسجيل الدخول.' })

  if (await isBlocked(user.id))
    return res.status(403).json({ error: 'تم حظر حسابك. تواصل مع الإدارة.' })

  const body    = req.body || {}
  const rateKey = `${user.id}::${body.episode_id || 'unknown'}`
  if (!checkRate(rateKey))
    return res.status(429).json({ error: 'تجاوزت الحد المسموح (٣ مرات). انتظر ساعة.' })

  const { episode_id, killer, weapon, motive, narrative, confidence_scale } = body

  // التحقق من الحقول الإلزامية — موحّدة مع case.html
  if (!episode_id)
    return res.status(400).json({ error: 'episode_id مطلوب.' })
  if (!killer?.trim() || killer.trim().length < 3)
    return res.status(400).json({ error: 'يجب تحديد المشتبه به (٣ أحرف على الأقل).' })
  if (!weapon?.trim() || weapon.trim().length < 3)
    return res.status(400).json({ error: 'يجب تحديد السلاح أو الأداة (٣ أحرف على الأقل).' })
  if (!motive?.trim() || motive.trim().length < 3)
    return res.status(400).json({ error: 'يجب تحديد الدافع (٣ أحرف على الأقل).' })
  if (!narrative?.trim() || narrative.trim().length < 80)
    return res.status(400).json({ error: 'الرواية قصيرة جداً (٨٠ حرفاً على الأقل).' })
  if (!confidence_scale || confidence_scale < 1 || confidence_scale > 5)
    return res.status(400).json({ error: 'مستوى الثقة يجب أن يكون بين ١ و٥.' })

  // إصلاح user_nickname — يأخذ الاسم الكامل أو اسم Google أو جزء الإيميل
  const userNickname =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'مجهول'

  const theory = {
    episode_id,
    user_id:          user.id,
    user_email:       user.email,
    user_name:        userNickname,
    user_nickname:    userNickname,
    killer:           killer.trim(),
    weapon:           weapon.trim(),
    motive:           motive.trim(),
    execution_method: (body.execution_method || '').trim(),
    crime_scene:      (body.crime_scene || '').trim(),
    silent_witness:   (body.silent_witness || '').trim(),
    narrative:        narrative.trim(),
    relationship_map: body.relationship_map || null,
    confidence_scale: Math.min(5, Math.max(1, parseInt(confidence_scale))),
    confident_bet:    !!body.confident_bet,
    early_submission: !!body.early_submission,
    submitted_at:     new Date().toISOString()
  }

  try {
    const n8nRes = await fetch(N8N_WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ body: theory })
    })

    if (!n8nRes.ok)
      return res.status(500).json({ error: 'خطأ في معالجة النظرية. حاول مجدداً.' })

    return res.status(200).json({
      success: true,
      message: 'تم إرسال نظريتك! المحقق خالد يراجعها الآن. 🕵️'
    })

  } catch (err) {
    console.error('[Sijil187]', err.message)
    return res.status(500).json({ error: 'خطأ في الخادم. تحقق من الإنترنت.' })
  }
}
