import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'About Us | Our Story',
  description:
    'Born at the FIFA World Cup 2026 IBC in Dallas. First Eleven Cleaners is a veteran-owned, minority-certified premium dry cleaning and laundry service serving the Dallas-Fort Worth Metroplex.',
};

const CERTIFICATIONS = [
  { code: 'MBE', label: 'Minority Business Enterprise', icon: '🏅' },
  { code: 'SDVOSB', label: 'Service-Disabled Veteran-Owned Small Business', icon: '🎖️' },
  { code: 'Veteran-HUB', label: 'Texas Veteran Historically Underutilized Business', icon: '⭐' },
  { code: 'DBE', label: 'Disadvantaged Business Enterprise', icon: '🌟' },
  { code: 'NCTRCA', label: 'North Central Texas Regional Certification Agency', icon: '✅' },
  { code: 'NMSDC', label: 'National Minority Supplier Development Council', icon: '✅' },
];

const TIMELINE = [
  {
    year: 'The Origin',
    title: 'The Starting Lineup Concept',
    body: 'First Eleven Cleaners is named after football\'s greatest idea — eleven individuals who move as one, each in the right position, at the right moment. We built this company on that principle: every garment in the right process, every step documented, every customer informed.',
  },
  {
    year: 'Summer 2026',
    title: 'The FIFA World Cup 2026 — Dallas IBC',
    body: 'We were selected to operate the garment-care facility at the FIFA World Cup 2026™ International Broadcast Centre in Dallas. For twelve consecutive weeks, we served 3,500 accredited international media professionals — journalists, producers, and broadcast crews from around the globe — completing 27+ transactions per day, zero documented disputes, and a signed Vendor Performance Confirmation at close.',
  },
  {
    year: 'The Lessons',
    title: 'What the World Cup Taught Us',
    body: 'Twelve weeks under live-event pressure taught us what no business plan could: that demand data beats assumptions, documentation is destiny, labor discipline decides profitability, and evidence defeats disputes. These aren\'t values on a wall — they\'re operational disciplines wired into every system we built.',
  },
  {
    year: 'August 2026',
    title: 'First Eleven Cleaners — Public Launch',
    body: 'We took every lesson from the world\'s biggest stage and built a company around them. The same photo-intake protocol, the same two-checkpoint quality system, the same AI-assisted operations — now available to every home, salon, gym, and hotel across the Dallas-Fort Worth Metroplex.',
  },
];

const PRINCIPLES = [
  {
    icon: '📸',
    title: 'Documentation is Destiny',
    body: 'Every garment is photographed at intake and return. We proved at the IBC that photographic evidence ends disputes in thirty seconds. That protocol is now your Garment Passport — a visual record of every item, every cleaning, every handoff.',
  },
  {
    icon: '💰',
    title: 'No Hidden Fees. Ever.',
    body: 'Every price is published before checkout, always. We watched competitors surprise customers with fees they never saw coming. First Eleven\'s founding contract with you is simple: you see the total before we charge it. If you weigh more than estimated — you see the new ticket and photos before we touch your card.',
  },
  {
    icon: '📊',
    title: 'Labor Discipline Decides Profitability',
    body: 'Our operations run with a live dashboard tracking labor as a percentage of net sales, with a hard ceiling of 32%. This isn\'t a quarterly report — it\'s a daily discipline we learned at the IBC, where that single metric was the line between a profitable operation and a loss.',
  },
  {
    icon: '⚡',
    title: 'Responsiveness is the Product',
    body: 'At the IBC, international media crews needed confirmation in minutes, not hours. We delivered that manually. Eleven — our AI concierge — delivers it automatically, around the clock, in your language. Six status messages from booking to delivery: every stage, every time.',
  },
  {
    icon: '🤝',
    title: 'Refund First, Ask Later',
    body: 'Inspired by Chewy\'s legendary customer service. Our "Make It Right" button is on every receipt — one tap opens a claim with your garment\'s photos already attached. We don\'t make you argue. We make it right.',
  },
  {
    icon: '🗺️',
    title: 'No ZIP Fences',
    body: 'Uber doesn\'t ask permission by ZIP code, and neither do we. Any address in the Dallas-Fort Worth Metroplex can book on Day One. Dense zones earn daily service. Emerging zones get scheduled service days. Every accepted booking gets a committed window — never a rejection.',
  },
];

export default function AboutPage() {
  return (
    <div className={styles.page}>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          ⚽ FIFA World Cup 2026™ · International Broadcast Centre · Dallas, Texas
        </div>
        <h1 className={styles.heroTitle}>
          Born on the World&apos;s{' '}
          <span className={styles.accent}>Biggest Stage.</span>
        </h1>
        <p className={styles.heroSubtitle}>
          Now serving yours.
        </p>
        <p className={styles.heroBody}>
          We didn&apos;t start in a strip mall. We started at the center of the world&apos;s most-watched
          sporting event, serving 3,500 international media professionals under live-event pressure —
          and we brought every lesson home to Dallas.
        </p>
        <div className={styles.heroActions}>
          <Link href={ROUTES.book}>
            <Button variant="primary" size="lg">Schedule a Pickup</Button>
          </Link>
          <Link href={ROUTES.commercial}>
            <Button variant="outlineLight" size="lg">For Business</Button>
          </Link>
        </div>
      </section>

      {/* ── The FIFA Proof Bar ── */}
      <section className={styles.proofBar}>
        <div className={styles.proofBarInner}>
          <div className={styles.proofStat}>
            <span className={styles.proofNumber}>3,500</span>
            <span className={styles.proofLabel}>International Media Professionals Served</span>
          </div>
          <div className={styles.proofDivider} />
          <div className={styles.proofStat}>
            <span className={styles.proofNumber}>12</span>
            <span className={styles.proofLabel}>Consecutive Weeks of Operations</span>
          </div>
          <div className={styles.proofDivider} />
          <div className={styles.proofStat}>
            <span className={styles.proofNumber}>27+</span>
            <span className={styles.proofLabel}>Orders Processed Per Day</span>
          </div>
          <div className={styles.proofDivider} />
          <div className={styles.proofStat}>
            <span className={styles.proofNumber}>0</span>
            <span className={styles.proofLabel}>Documented Disputes</span>
          </div>
        </div>
      </section>

      {/* ── The Story — Timeline ── */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Our Story</h2>
            <p className={styles.sectionSubtitle}>
              Every great club has an origin. This is ours.
            </p>
          </div>

          <div className={styles.timeline}>
            {TIMELINE.map((item, i) => (
              <div key={i} className={styles.timelineItem}>
                <div className={styles.timelineMarker}>
                  <div className={styles.timelineDot} />
                  {i < TIMELINE.length - 1 && <div className={styles.timelineLine} />}
                </div>
                <div className={styles.timelineContent}>
                  <span className={styles.timelineYear}>{item.year}</span>
                  <h3 className={styles.timelineTitle}>{item.title}</h3>
                  <p className={styles.timelineBody}>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Founder Card ── */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={styles.founderCard}>
            <div className={styles.founderBadge}>⚽</div>
            <div className={styles.founderContent}>
              <span className={styles.founderEyebrow}>Leadership</span>
              <h2 className={styles.founderName}>Idowu Itiola, Ph.D., PMP, LEED AP BD+C</h2>
              <p className={styles.founderTitle}>Founder, President &amp; CEO — Lydia Painting, LLC d/b/a First Eleven Cleaners</p>
              <p className={styles.founderBio}>
                Dr. Itiola brings a rare combination of academic rigor and operational discipline to the
                garment-care industry. A Project Management Professional, LEED-Accredited sustainability
                specialist, and combat-experienced veteran, he designed the systems that powered the FIFA
                World Cup IBC operation — and rebuilt them from the ground up as the foundation of
                First Eleven Cleaners.
              </p>
              <p className={styles.founderBio}>
                His operating philosophy: <em>&ldquo;If it is not written, it does not exist.&rdquo;</em>{' '}
                Every process is documented, every price is published, every garment is photographed.
                That discipline isn&apos;t policy — it&apos;s the standard the World Cup demanded and
                that our customers now receive.
              </p>
              <div className={styles.founderLocation}>
                📍 Farmers Branch, Texas &nbsp;·&nbsp; Dallas-Fort Worth Metroplex
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Operating Principles ── */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              How We <span className={styles.accent}>Operate</span>
            </h2>
            <p className={styles.sectionSubtitle}>
              Six principles. All proven under pressure. None negotiable.
            </p>
          </div>
          <div className={styles.principlesGrid}>
            {PRINCIPLES.map((p, i) => (
              <div key={i} className={styles.principleCard}>
                <div className={styles.principleIcon}>{p.icon}</div>
                <h3 className={styles.principleTitle}>{p.title}</h3>
                <p className={styles.principleBody}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Certifications ── */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Certified &amp; Credentialed</h2>
            <p className={styles.sectionSubtitle}>
              Our certification portfolio opens institutional doors no ordinary cleaner can walk through.
            </p>
          </div>
          <div className={styles.certsGrid}>
            {CERTIFICATIONS.map((cert) => (
              <div key={cert.code} className={styles.certCard}>
                <span className={styles.certIcon}>{cert.icon}</span>
                <span className={styles.certCode}>{cert.code}</span>
                <span className={styles.certLabel}>{cert.label}</span>
              </div>
            ))}
          </div>
          <p className={styles.certNote}>
            Our SDVOSB and Veteran-HUB certifications make First Eleven eligible for VA Vets First priority
            procurement and SDVOSB sole-source contracts — categories in which qualified garment-care vendors
            are scarce across North Texas. We are the only provider in this market that can attach a{' '}
            <strong>FIFA World Cup Vendor Performance Letter</strong> to an institutional bid.
          </p>
        </div>
      </section>

      {/* ── The Name ── */}
      <section className={styles.nameBanner}>
        <div className={styles.container}>
          <div className={styles.nameContent}>
            <div className={styles.nameBall}>⚽</div>
            <div>
              <h2 className={styles.nameTitle}>Why &ldquo;First Eleven&rdquo;?</h2>
              <p className={styles.nameBody}>
                In football, the Starting Eleven is the coach&apos;s highest expression of confidence —
                eleven individuals who train relentlessly, execute precisely, and trust each other completely.
                No star player wins alone. No single process saves a garment alone.
              </p>
              <p className={styles.nameBody}>
                We named this company after that idea because great garment care is a team sport:
                the AI concierge who books your order, the driver who photographs your doorstep,
                the intake specialist who documents every item, the quality inspector who checks twice,
                and the system that messages you at every stage — that&apos;s the Starting Eleven.
                Your clothes deserve nothing less.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── What We Don't Do ── */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.dualCol}>
            <div className={styles.dualColText}>
              <h2 className={styles.sectionTitle}>
                What We <span className={styles.accentRed}>Don&apos;t</span> Do
              </h2>
              <p className={styles.sectionSubtitle}>Boundaries are how trust is built.</p>
              <ul className={styles.dontList}>
                <li>❌ We don&apos;t hide fees — every price is published before checkout, always</li>
                <li>❌ We don&apos;t reject DFW addresses — any address can book, Day One</li>
                <li>❌ We don&apos;t charge before you see your itemized receipt and photos</li>
                <li>❌ We don&apos;t make you argue about damage — photos are the evidence, claim is one tap</li>
                <li>❌ We don&apos;t go quiet — six status messages from booking to delivered, every order</li>
                <li>❌ We don&apos;t guess at your preferences — Eleven remembers them for you</li>
              </ul>
            </div>
            <div className={styles.dualColStats}>
              <div className={styles.statCard}>
                <span className={styles.statNumber}>48h</span>
                <span className={styles.statDesc}>Match-Ready Guarantee — pickup to delivery</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statNumber}>6</span>
                <span className={styles.statDesc}>Status updates sent on every single order</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statNumber}>≤32%</span>
                <span className={styles.statDesc}>Labor as % of sales — our operational ceiling</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statNumber}>$0</span>
                <span className={styles.statDesc}>Surprise fees — guaranteed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.cta}>
        <div className={styles.container}>
          <h2 className={styles.ctaTitle}>
            We served the world.<br />
            <span className={styles.accent}>Now we&apos;re ready to serve yours.</span>
          </h2>
          <p className={styles.ctaSubtitle}>
            Premium pickup &amp; delivery dry cleaning across the Dallas-Fort Worth Metroplex.
            48-hour turnaround. Every step tracked. Every price visible. No surprises — ever.
          </p>
          <div className={styles.ctaActions}>
            <Link href={ROUTES.book}>
              <Button variant="primary" size="lg">Schedule Your First Pickup</Button>
            </Link>
            <Link href={ROUTES.commercial}>
              <Button variant="outline" size="lg">Enquire for Business</Button>
            </Link>
          </div>
          <p className={styles.ctaPromo}>
            First order? Use code <strong>KICKOFF15</strong> for 15% off.
          </p>
        </div>
      </section>

    </div>
  );
}
