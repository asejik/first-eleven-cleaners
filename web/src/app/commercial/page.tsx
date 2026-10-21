'use client';

import { useState, type FormEvent } from 'react';
import { Award, BadgeCheck, Building2, Camera, CircleCheck, Dumbbell, Hotel, Medal, Scissors, ShieldCheck, Star, Timer, TrendingDown, Truck, Zap } from 'lucide-react';
import { Button, Input, Card, Icon } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { COMMERCIAL_PROPOSAL_TIME, COMMERCIAL_REPLY, COMMERCIAL_TURNAROUND, COMMERCIAL_TURNAROUND_TITLE } from '@/lib/commercial/promises';
import { INDUSTRIES, VOLUMES, type Industry, type Volume } from '@/lib/commercial/inquiry-options';
import { SUPPORT_PHONE } from '@/lib/constants';
import styles from './page.module.css';

export default function CommercialPage() {
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [industry, setIndustry] = useState<Industry>('salon_spa');
  const [volumeEstimate, setVolumeEstimate] = useState<Volume>('weekly_50_150');
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState(''); // hidden from people: only bots fill it
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  const addToast = useUIStore((s) => s.addToast);

  // Emailed to the support inbox by /api/commercial/inquiry (client 2026-10-21)
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError('');
    try {
      const res = await fetch('/api/commercial/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          contact_name: contactName,
          email,
          phone,
          industry,
          volume: volumeEstimate,
          notes,
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || `We couldn't send your inquiry just now. Please try again, or call us at ${SUPPORT_PHONE}.`);
        return;
      }
      setSubmitted(true);
      addToast({
        type: 'success',
        title: 'Inquiry Received',
        message: `${COMMERCIAL_REPLY} We send your proposal ${COMMERCIAL_PROPOSAL_TIME}.`,
      });
    } catch {
      setFormError(`We couldn't send your inquiry just now. Please check your connection and try again, or call us at ${SUPPORT_PHONE}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.heroSection}>
        <div className={styles.container}>
          <span className={styles.badge}>B2B & Institutional Garment Programs</span>
          <h1 className={styles.heroTitle}>Commercial Laundry & Dry Cleaning for DFW Businesses</h1>
          <p className={styles.heroSubtitle}>
            Agreed rate cards and recurring pickup schedules for Dallas-Fort Worth businesses, with the
            same {COMMERCIAL_TURNAROUND_TITLE.toLowerCase()}, Match-Ready Check and guarantee as every First Eleven order.
          </p>
        </div>
      </section>

      {/* Industries & Programs Grid */}
      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionHeading}>Designed for Demanding Operations</h2>
          <p className={styles.sectionSubheading}>
            From luxury spas to corporate uniforms, we bring the same discipline we brought to the FIFA World Cup 2026 International Broadcast Centre.
          </p>

          <div className={styles.industryGrid}>
            <Card variant="bordered" padding="lg" className={styles.industryCard}>
              <span className={styles.indIcon}><Icon icon={Scissors} size={32} strokeWidth={1.5} /></span>
              <h3>Salons & Med-Spas</h3>
              <p>
                Plush towel and robe programs, sanitization treatment, and crisp presentation for boutique wellness brands.
              </p>
            </Card>

            <Card variant="bordered" padding="lg" className={styles.industryCard}>
              <span className={styles.indIcon}><Icon icon={Dumbbell} size={32} strokeWidth={1.5} /></span>
              <h3>Athletic Clubs & Gyms</h3>
              <p>
                Heavy-duty towel turnaround, antimicrobial washing, and automated pickup schedules matched to peak hours.
              </p>
            </Card>

            <Card variant="bordered" padding="lg" className={styles.industryCard}>
              <span className={styles.indIcon}><Icon icon={Hotel} size={32} strokeWidth={1.5} /></span>
              <h3>Boutique Hotels & Airbnbs</h3>
              <p>
                Linen turnover, premium duvet pressing, guest dry cleaning with door-to-door concierge delivery.
              </p>
            </Card>

            <Card variant="bordered" padding="lg" className={styles.industryCard}>
              <span className={styles.indIcon}><Icon icon={Building2} size={32} strokeWidth={1.5} /></span>
              <h3>Corporate & Uniforms</h3>
              <p>
                Team garment accounts, executive dry cleaning, and consolidated invoicing.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Concrete B2B Service Outcomes */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <span className={styles.badgeGold}>Business Accounts</span>
            <h2 className={styles.sectionHeading}>What Every Business Account Includes</h2>
            <p className={styles.sectionSubheading}>
              Your schedule and rates are set out in writing before the first pickup. Everything else is
              the promise every First Eleven customer gets.
            </p>
          </div>

          <div className={styles.outcomesGrid}>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={Timer} size={28} strokeWidth={1.5} /></span>
              <h3>{COMMERCIAL_TURNAROUND_TITLE}</h3>
              <p>Pickups Monday to Friday, back {COMMERCIAL_TURNAROUND} after pickup, the same as our residential service. We don&apos;t offer same-day service.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={ShieldCheck} size={28} strokeWidth={1.5} /></span>
              <h3>11-Point Match-Ready Check</h3>
              <p>Every order passes our 11-point Match-Ready Check before it leaves the plant.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={Camera} size={28} strokeWidth={1.5} /></span>
              <h3>Garment Passport</h3>
              <p>Every garment photographed and tracked by order number in the Garment Passport, from pickup to delivery.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={BadgeCheck} size={28} strokeWidth={1.5} /></span>
              <h3>Make It Right Guarantee</h3>
              <p>Not happy with the cleaning or pressing of a garment? Tell us within 7 days of delivery and we re-clean it free.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={Truck} size={28} strokeWidth={1.5} /></span>
              <h3>Dedicated Routes &amp; Support</h3>
              <p>Recurring pickup windows set around your shift changes, and a direct contact for your account by phone and email.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={TrendingDown} size={28} strokeWidth={1.5} /></span>
              <h3>Volume Rate Cards</h3>
              <p>Rates quoted for your volume and agreed before your first pickup, with every order itemized.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Certification Advantage (Procurement Ready Differentiator) */}
      <section className={styles.procurementSection}>
        <div className={styles.container}>
          <div className={styles.certContent}>
            <div className={styles.badgeGoldGlowing}>
              <span className={styles.badgeDot}></span>
              Procurement Ready
            </div>
            <h2 className={styles.certTitle}>
              Rare Federal &amp; State <span className={styles.certAccent}>Certification Stack</span>
            </h2>
            <p className={styles.certText}>
              First Eleven Cleaners holds active certified status across federal, state, and corporate supplier-diversity portals:
            </p>
            <div className={styles.certGrid}>
              <div className={styles.certBox}>
                <div className={styles.certHeader}>
                  <span className={styles.certIcon}><Icon icon={Medal} size={22} /></span>
                  <span className={styles.certTag}>Federal</span>
                </div>
                <strong>SDVOSB</strong>
                <span>Service-Disabled Veteran-Owned Small Business</span>
              </div>
              <div className={styles.certBox}>
                <div className={styles.certHeader}>
                  <span className={styles.certIcon}><Icon icon={Star} size={22} /></span>
                  <span className={styles.certTag}>State</span>
                </div>
                <strong>Texas Veteran-HUB</strong>
                <span>Historically Underutilized Business</span>
              </div>
              <div className={styles.certBox}>
                <div className={styles.certHeader}>
                  <span className={styles.certIcon}><Icon icon={Award} size={22} /></span>
                  <span className={styles.certTag}>Corporate</span>
                </div>
                <strong>MBE / NMSDC</strong>
                <span>Minority Business Enterprise</span>
              </div>
              <div className={styles.certBox}>
                <div className={styles.certHeader}>
                  <span className={styles.certIcon}><Icon icon={Award} size={22} /></span>
                  <span className={styles.certTag}>Regional</span>
                </div>
                <strong>DBE / NCTRCA</strong>
                <span>Disadvantaged Business Enterprise</span>
              </div>
            </div>

            <div className={styles.procurementPill}>
              <span className={styles.procurementPillIcon}><Icon icon={Zap} size={20} /></span>
              <span>
                <strong>Institutional Advantage:</strong> Eligible for VA Vets First priority procurement, SDVOSB sole-source contracts, Texas state HUB set-asides, and corporate Tier-1 diversity supplier spend credits.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Inquiry Form */}
      <section className={styles.section} id="inquiry-form">
        <div className={styles.container}>
          <div className={styles.formWrapper}>
            <Card variant="bordered" padding="lg" className={styles.inquiryCard}>
              <h2 className={styles.formTitle}>Request a Custom Commercial Rate Card</h2>
              <p className={styles.formSubtitle}>
                Tell us about your organization and volume requirements. {COMMERCIAL_REPLY} Your custom proposal
                follows {COMMERCIAL_PROPOSAL_TIME}.
              </p>

              {submitted ? (
                <div className={styles.successState}>
                  <span className={styles.successIcon}><Icon icon={CircleCheck} size={48} strokeWidth={1.5} /></span>
                  <h3>Thank You for Reaching Out</h3>
                  <p>
                    Your commercial inquiry for <strong>{businessName}</strong> has been logged. Our corporate accounts team will contact you at <strong>{email}</strong> with a customized proposal and rate card.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className={styles.form}>
                  <div className={styles.formRow}>
                    <Input
                      label="Company / Business Name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Dallas Wellness Spa"
                      required
                    />
                    <Input
                      label="Contact Person"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Jane Smith"
                      required
                    />
                  </div>

                  <div className={styles.formRow}>
                    <Input
                      label="Work Email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@company.com"
                      required
                    />
                    <Input
                      label="Phone Number"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(214) 555-0100"
                      required
                    />
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.selectGroup}>
                      <label htmlFor="industrySelect">Industry / Sector</label>
                      <select
                        id="industrySelect"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value as Industry)}
                        className={styles.selectInput}
                      >
                        {Object.entries(INDUSTRIES).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.selectGroup}>
                      <label htmlFor="volumeSelect">Estimated Monthly Volume</label>
                      <select
                        id="volumeSelect"
                        value={volumeEstimate}
                        onChange={(e) => setVolumeEstimate(e.target.value as Volume)}
                        className={styles.selectInput}
                      >
                        {Object.entries(VOLUMES).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className={styles.textareaGroup}>
                    <label htmlFor="notesInput">Specific Requirements or Special Garments</label>
                    <textarea
                      id="notesInput"
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Tell us about turnaround timing, pickup preferences, or specialty garment requirements..."
                      className={styles.textarea}
                    />
                  </div>

                  <div className={styles.honeypot} aria-hidden="true">
                    <label htmlFor="websiteInput">Website</label>
                    <input
                      id="websiteInput"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>

                  {formError && (
                    <p className={styles.formError} role="alert">
                      {formError}
                    </p>
                  )}

                  <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting}>
                    Submit Commercial Inquiry
                  </Button>
                </form>
              )}
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
