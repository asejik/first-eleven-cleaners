import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES, APP_NAME } from '@/lib/constants';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'First Eleven Cleaners Terms of Service. Governing law, garment care guarantees, liability limitations, and operational policies across Dallas-Fort Worth.',
};

export default function TermsOfServicePage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.hero}>
          <span className={styles.badge}>Legal &amp; Trust</span>
          <h1 className={styles.title}>Terms of Service</h1>
          <p className={styles.subtitle}>
            Effective Date: September 2, 2026 • First Eleven Cleaners
          </p>
        </div>

        <div className={styles.card}>
          {/* Section 1: Acceptance */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Acceptance of Terms</h2>
            <p className={styles.paragraph}>
              By accessing our website, creating an account, or scheduling dry cleaning or laundry pickup through First Eleven Cleaners (&quot;First Eleven,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), you agree to be bound by these Terms of Service.
            </p>
            <p className={styles.paragraph}>
              If you do not agree to these Terms, please do not use our services.
            </p>
          </section>

          {/* Section 2: Services */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Services Provided</h2>
            <p className={styles.paragraph}>
              First Eleven Cleaners provides premium garment care and logistics across the Dallas-Fort Worth Metroplex, including:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Professional eco-friendly dry cleaning and hand-finishing</li>
              <li className={styles.listItem}>Wash-and-fold laundry service with custom detergent and folding specifications</li>
              <li className={styles.listItem}>Garment pressing and hand-steaming</li>
              <li className={styles.listItem}>Contactless and attended doorstep pickup and delivery</li>
              <li className={styles.listItem}>Commercial and institutional uniform care programs</li>
              <li className={styles.listItem}>AI-assisted customer concierge (&quot;Eleven&quot;) and online client portals</li>
            </ul>
            <p className={styles.paragraph}>
              Services are subject to regional geographic availability and plant operational capacity.
            </p>
          </section>

          {/* Section 3: Customer Accounts */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. Customer Accounts &amp; Access</h2>
            <p className={styles.paragraph}>You are responsible for:</p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Providing accurate contact details, delivery addresses, and property gate codes</li>
              <li className={styles.listItem}>Maintaining the confidentiality of your credentials and account session</li>
              <li className={styles.listItem}>Ensuring safe, unobstructed physical access for our logistics couriers</li>
              <li className={styles.listItem}>All activities, bookings, and charges conducted under your authenticated account</li>
            </ul>
          </section>

          {/* Section 4: Transparent Pricing */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Pricing, Fees &amp; Invisible Checkout</h2>
            <p className={styles.paragraph}>
              All core prices are published transparently on our website prior to booking. Wash-and-fold is priced at $3.00/lb subject to a 15-lb minimum floor ($45.00 minimum charge). Dry cleaning is priced per garment according to our published item catalog.
            </p>
            <p className={styles.paragraph}>
              <strong>Invisible Checkout Protocol:</strong> When you book a pickup, your card on file is pre-authorized. We do not finalize or settle charges until your garments arrive at our central facility, are weighed on certified scales, itemized, and photographed into your Garment Passport.
            </p>
          </section>

          {/* Section 5: Pickup and Delivery Services */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Pickup and Delivery Logistics</h2>
            <p className={styles.paragraph}>
              Couriers operate within designated morning (7:30 AM – 10:00 AM) and evening (5:00 PM – 8:00 PM) windows. Customers must ensure that bags are placed in safe, weather-protected locations or hand-delivered to the courier. Pets must be secured.
            </p>
            <p className={styles.paragraph}>
              Missed pickups due to inaccessible properties or incorrect gate instructions may be rescheduled or incur a dry-run fee. Delivery times represent estimates backed by our 48-Hour Match-Ready Guarantee, excluding Sundays when our main plant is closed.
            </p>
          </section>

          {/* Section 6: Garment Passport */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Garment Inspection &amp; Garment Passport</h2>
            <p className={styles.paragraph}>
              Every garment entering our facility is barcoded, cataloged, and photographed under studio lighting. Condition notes, missing buttons, fabric wear, and pre-existing tears are recorded in your digital Garment Passport.
            </p>
            <p className={styles.paragraph}>
              Customers are urged to disclose known vulnerabilities, stains, or delicate trims in their booking notes. Failure to disclose known defects may affect warranty and claim eligibility.
            </p>
          </section>

          {/* Section 7: Inherent Risk Items */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. Items Accepted at Customer Risk</h2>
            <div className={styles.callout}>
              <strong>High-Risk Fabrics:</strong> Certain luxury or delicate materials possess inherent characteristics that may react unpredictably to standard solvent or aqueous cleaning.
            </div>
            <p className={styles.paragraph}>
              Items accepted at owner risk include: genuine leather, suede, natural furs, silks with unstable dyes, sequined or beaded garments, antique/vintage garments (over 10 years old), and garments lacking permanent FTC care labels.
            </p>
          </section>

          {/* Section 8: Claims and Make It Right */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>8. Claims, Damage &amp; Satisfaction Guarantee</h2>
            <p className={styles.paragraph}>
              Under our <strong>Make It Right Guarantee</strong>, if you are dissatisfied with the cleaning or press quality of any garment, notify us within <strong>7 calendar days of delivery</strong>, and we will re-clean the item at zero additional charge.
            </p>
            <p className={styles.paragraph}>
              Any formal claim for garment loss or physical damage must be filed through the customer portal or by emailing <a href="mailto:legal@firstelevencleaners.com" className={styles.contactLink}>legal@firstelevencleaners.com</a> within <strong>7 calendar days of delivery</strong>, accompanied by the original intake Garment Passport photo. First Eleven Cleaners reserves the right to physically inspect the garment before resolving any claim.
            </p>
          </section>

          {/* Section 9: Limitation of Liability */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>9. Limitation of Liability</h2>
            <p className={styles.paragraph}>
              To the maximum extent permitted by applicable law, the liability of First Eleven Cleaners for any lost or damaged garment shall not exceed:
            </p>
            <div className={styles.callout}>
              <strong>Liability Cap:</strong> The actual cleaning charge paid for the affected garment, or <strong>ten (10) times the cleaning charge</strong> for that specific garment, whichever is greater.
            </div>
            <p className={styles.paragraph}>
              First Eleven Cleaners is not liable for incidental, indirect, or consequential damages, nor for:
            </p>
            <ul className={styles.list}>
              <li className={styles.listItem}>Pre-existing tears, moth holes, sun fade, or aged fabric breakdown</li>
              <li className={styles.listItem}>Normal wear, shrinking due to manufacturer sizing instability, or defective buttons/zippers</li>
              <li className={styles.listItem}>Color bleeding resulting from manufacturer improper dying or lack of colorfastness</li>
              <li className={styles.listItem}>Cash, jewelry, or personal items left inside garment pockets</li>
              <li className={styles.listItem}>Unclaimed garments held for more than 90 days after delivery attempts</li>
            </ul>
          </section>

          {/* Section 10: Commercial Accounts */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>10. Commercial Accounts &amp; Net Terms</h2>
            <p className={styles.paragraph}>
              Corporate, athletic, hospitality, and institutional clients may be governed by customized Master Services Agreements (MSAs) or Net 15 / Net 30 payment terms. In the event of a direct conflict between these standard Terms and an executed commercial agreement, the executed commercial agreement controls.
            </p>
          </section>

          {/* Section 11: Acceptable Use */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>11. Acceptable Use &amp; Non-Harassment</h2>
            <p className={styles.paragraph}>
              Customers agree not to submit hazardous materials, biological biohazards, or pest-infested items. We maintain zero tolerance for harassment, verbal abuse, or unsafe conduct toward our delivery drivers or facility personnel.
            </p>
          </section>

          {/* Section 12: Electronic & SMS Communications */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>12. Electronic Communications &amp; TCPA Consent</h2>
            <p className={styles.paragraph}>
              By creating an account or booking a pickup, you consent to receive electronic receipts, legal notices, and operational notifications. Order progress alerts and driver tracking updates are delivered via SMS or WhatsApp. Promotional communications require separate opt-in consent and can be revoked at any time by texting STOP.
            </p>
          </section>

          {/* Section 13: Governing Law & Dispute Resolution */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>13. Governing Law &amp; Dispute Resolution</h2>
            <p className={styles.paragraph}>
              These Terms of Service are governed by and construed in accordance with the substantive laws of the <strong>State of Texas</strong>, without regard to its conflict-of-laws principles.
            </p>
            <p className={styles.paragraph}>
              <strong>Informal Resolution:</strong> Before initiating formal proceedings, both parties agree to attempt good-faith informal resolution by providing written notice to <a href="mailto:legal@firstelevencleaners.com" className={styles.contactLink}>legal@firstelevencleaners.com</a>.
            </p>
            <p className={styles.paragraph}>
              If a dispute cannot be resolved within 30 days of notice, exclusive venue and jurisdiction for any legal action or arbitration shall reside in state or federal courts located in <strong>Dallas County, Texas</strong>.
            </p>
          </section>

          {/* Contact Box */}
          <div className={styles.contactBox}>
            <h3 className={styles.contactTitle}>14. Contact Our Legal Department</h3>
            <p className={styles.contactText}>
              <strong>{APP_NAME}</strong><br />
              Operated by Lydia Painting, LLC<br />
              Dallas-Fort Worth Metroplex, Texas<br />
              Direct Legal Inquiries: <a href="mailto:legal@firstelevencleaners.com" className={styles.contactLink}>legal@firstelevencleaners.com</a>
            </p>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <Link href={ROUTES.privacy} className={styles.contactLink}>
                Review our Privacy Policy →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
