import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES, APP_NAME } from '@/lib/constants';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'First Eleven Cleaners Privacy Policy. How we collect, use, and protect your information across Dallas-Fort Worth.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.hero}>
          <span className={styles.badge}>Legal &amp; Trust</span>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.subtitle}>
            Effective Date: September 2, 2026 • First Eleven Cleaners
          </p>
        </div>

        <div className={styles.card}>
          {/* Section 1: Introduction */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Introduction</h2>
            <p className={styles.paragraph}>
              First Eleven Cleaners (&quot;First Eleven,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) respects your privacy and is committed to protecting your personal information.
            </p>
            <p className={styles.paragraph}>
              This Privacy Policy explains how we collect, use, disclose, store, and protect information when you use our website, mobile applications, booking platform, AI Concierge (&quot;Eleven&quot;), customer portal, SMS services, WhatsApp services, and laundry, dry-cleaning, pickup, and delivery services across the Dallas-Fort Worth Metroplex.
            </p>
            <p className={styles.paragraph}>
              By using our services, you agree to the practices described in this Privacy Policy.
            </p>
          </section>

          {/* Section 2: Information We Collect */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Information We Collect</h2>
            
            <h3 className={styles.subheading}>Information You Provide</h3>
            <p className={styles.paragraph}>We may collect:</p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Name, email address, and phone number</li>
              <li className={styles.listItem}>Billing address, pickup and delivery street addresses</li>
              <li className={styles.listItem}>Account credentials and authentication session tokens</li>
              <li className={styles.listItem}>Garment preferences, starch levels, and folding specifications</li>
              <li className={styles.listItem}>Delivery instructions and gate or property access codes</li>
              <li className={styles.listItem}>Customer support inquiries and feedback communications</li>
              <li className={styles.listItem}>Commercial account and institutional billing details</li>
            </ul>

            <h3 className={styles.subheading}>Garment Information &amp; Digital Passport</h3>
            <p className={styles.paragraph}>
              As part of our proprietary Garment Passport system, we may collect:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}>High-resolution intake and post-cleaning garment photographs</li>
              <li className={styles.listItem}>Condition inspection reports and damage observations</li>
              <li className={styles.listItem}>Manufacturer care label information and fiber compositions</li>
              <li className={styles.listItem}>Historical cleaning and treatment logs</li>
              <li className={styles.listItem}>Digital custody transfer and delivery verification timestamps</li>
            </ul>

            <h3 className={styles.subheading}>AI Concierge Interactions (&quot;Eleven&quot;)</h3>
            <p className={styles.paragraph}>
              When you communicate with Eleven through website chat, SMS, WhatsApp, or email, we may collect conversation history, voice notes, and specific service requests to maintain customer preferences and elevate service quality.
            </p>

            <h3 className={styles.subheading}>Automatically Collected Information</h3>
            <p className={styles.paragraph}>
              We may automatically collect device details, browser types, IP addresses, general geolocation, usage analytics, cookies, and system log files.
            </p>
          </section>

          {/* Section 3: How We Use Information */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. How We Use Information</h2>
            <p className={styles.paragraph}>We use information to:</p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Process and track laundry and dry cleaning orders</li>
              <li className={styles.listItem}>Dispatch drivers and schedule precision pickup and delivery windows</li>
              <li className={styles.listItem}>Maintain and operate the Garment Passport chain-of-custody system</li>
              <li className={styles.listItem}>Safely process payments and itemized adjustments</li>
              <li className={styles.listItem}>Send real-time progress updates, ETAs, and completion alerts</li>
              <li className={styles.listItem}>Manage customer accounts and corporate billing statements</li>
              <li className={styles.listItem}>Investigate, document, and resolve claims or quality inquiries</li>
              <li className={styles.listItem}>Comply with legal, tax, and regulatory obligations</li>
            </ul>
          </section>

          {/* Section 4: Text Messages, SMS, and WhatsApp */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Text Messages, SMS, and WhatsApp Communications</h2>
            <p className={styles.paragraph}>
              By providing your mobile phone number and opting in during booking or account registration, you authorize First Eleven Cleaners to transmit automated and human messages, including:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Booking and payment confirmations</li>
              <li className={styles.listItem}>Driver arrival ETAs and live pickup/delivery notifications</li>
              <li className={styles.listItem}>Garment passport inspection photos and itemized summaries</li>
              <li className={styles.listItem}>Customer service responses from Eleven and plant managers</li>
              <li className={styles.listItem}>Promotional specials, referral credits, and seasonal care tips</li>
            </ul>
            <div className={styles.callout}>
              <strong>TCPA Disclosure:</strong> Consent to receive promotional SMS is not a condition of purchase. Message frequency varies. Standard message and data rates may apply. You may opt out at any time by replying <strong>STOP</strong> to any SMS or contacting <a href="mailto:privacy@firstelevencleaners.com" className={styles.contactLink}>privacy@firstelevencleaners.com</a>.
            </div>
          </section>

          {/* Section 5: Payment Information */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Payment Information</h2>
            <p className={styles.paragraph}>
              Payments are processed through trusted third-party payment processors, including Square and related certified PCI-DSS compliant providers.
            </p>
            <p className={styles.paragraph}>
              <strong>First Eleven Cleaners does not store complete payment card numbers on our servers.</strong> All card transactions utilize tokenized credentials with our Invisible Checkout protocol: payment cards are securely verified at booking and only charged once items are weighed, inspected, and confirmed at intake.
            </p>
          </section>

          {/* Section 6: Sharing Information */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Sharing Information</h2>
            <div className={styles.callout}>
              <strong>We do not sell your personal information.</strong> Period.
            </div>
            <p className={styles.paragraph}>
              We may share information solely as necessary with trusted service providers who assist our operations:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Certified payment processors (Square)</li>
              <li className={styles.listItem}>Secure hosting and cloud database providers (Supabase, Vercel, AWS)</li>
              <li className={styles.listItem}>Logistics mapping and messaging infrastructure (Twilio, Resend)</li>
              <li className={styles.listItem}>AI infrastructure providers (Anthropic Claude API for Eleven)</li>
              <li className={styles.listItem}>Legal authorities when strictly required by enforceable subpoena or court order</li>
            </ul>
          </section>

          {/* Section 7: AI Services */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. AI Services (&quot;Eleven&quot;)</h2>
            <p className={styles.paragraph}>
              Our concierge services utilize artificial intelligence to support customer communications, summarize care instructions, analyze garment condition reports, and streamline scheduling.
            </p>
            <p className={styles.paragraph}>
              AI-generated responses are informational. Critical care decisions, claims determinations, and luxury garment inspections are always verified by human dry-cleaning professionals.
            </p>
          </section>

          {/* Section 8: Data Retention & Security */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>8. Data Retention &amp; Security</h2>
            <p className={styles.paragraph}>
              We retain personal information for as long as your account remains active or as needed to provide services, satisfy statutory tax obligations, and resolve claims. Garment photos and passport logs are archived for quality-control audit trails.
            </p>
            <p className={styles.paragraph}>
              We implement industry-standard administrative, cryptographic, and physical safeguards designed to prevent unauthorized access, alteration, or disclosure.
            </p>
          </section>

          {/* Section 9: Consumer Rights */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>9. Your Privacy Rights (TDPSA &amp; State Protections)</h2>
            <p className={styles.paragraph}>
              Under the Texas Data Privacy and Security Act (TDPSA) and applicable consumer privacy frameworks, you have the right to:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Confirm whether we process your personal data and access that data</li>
              <li className={styles.listItem}>Correct inaccuracies in your personal details</li>
              <li className={styles.listItem}>Request deletion of personal data provided by or obtained about you</li>
              <li className={styles.listItem}>Obtain a portable copy of your digital data</li>
              <li className={styles.listItem}>Opt out of the processing of personal data for targeted advertising</li>
            </ul>
            <p className={styles.paragraph}>
              To exercise these rights, submit your request to <a href="mailto:privacy@firstelevencleaners.com" className={styles.contactLink}>privacy@firstelevencleaners.com</a>. We verify and respond to verifiable consumer requests within statutory timelines without penalty or discrimination.
            </p>
          </section>

          {/* Section 10: Children's Privacy & Changes */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>10. Children&apos;s Privacy &amp; Policy Changes</h2>
            <p className={styles.paragraph}>
              Our services are directed to adults and are not intended for individuals under 13 years of age. We do not knowingly collect personal information from children.
            </p>
            <p className={styles.paragraph}>
              We may update this Privacy Policy periodically to reflect technological or legal updates. The revised effective date will be prominently displayed at the top of this document.
            </p>
          </section>

          {/* Contact Box */}
          <div className={styles.contactBox}>
            <h3 className={styles.contactTitle}>11. Contact Our Privacy Office</h3>
            <p className={styles.contactText}>
              <strong>{APP_NAME}</strong><br />
              Operated by Lydia Painting, LLC<br />
              Dallas-Fort Worth Metroplex, Texas<br />
              Direct Privacy Inquiries: <a href="mailto:privacy@firstelevencleaners.com" className={styles.contactLink}>privacy@firstelevencleaners.com</a>
            </p>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Link href={ROUTES.terms} className={styles.contactLink}>
                Review our Terms of Service →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
