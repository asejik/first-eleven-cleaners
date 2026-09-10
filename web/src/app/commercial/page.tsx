'use client';

import { useState, type FormEvent } from 'react';
import { Button, Input, Card } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import styles from './page.module.css';

export default function CommercialPage() {
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [industry, setIndustry] = useState('salon_spa');
  const [volumeEstimate, setVolumeEstimate] = useState('weekly_50_150');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const addToast = useUIStore((s) => s.addToast);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate inquiry submission or record to Supabase
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsSubmitting(false);
    setSubmitted(true);

    addToast({
      type: 'success',
      title: 'Inquiry Received',
      message: 'A First Eleven account executive will contact you within 24 business hours.',
    });
  };

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.heroSection}>
        <div className={styles.container}>
          <span className={styles.badge}>B2B & Institutional Garment Programs</span>
          <h1 className={styles.heroTitle}>SLA-Backed Commercial Laundry & Dry Cleaning</h1>
          <p className={styles.heroSubtitle}>
            Contracted rate cards, consolidated monthly invoicing, photo-documented chain of custody, and
            guaranteed turnaround times for Dallas-Fort Worth businesses.
          </p>
        </div>
      </section>

      {/* Industries & Programs Grid */}
      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionHeading}>Designed for Demanding Operations</h2>
          <p className={styles.sectionSubheading}>
            From luxury spas to corporate uniforms, we maintain the exact standards we proved at the FIFA World Cup IBC.
          </p>

          <div className={styles.industryGrid}>
            <Card variant="bordered" padding="lg" className={styles.industryCard}>
              <span className={styles.indIcon}>💆‍♀️</span>
              <h3>Salons & Med-Spas</h3>
              <p>
                Plush towel and robe programs, sanitization treatment, and crisp presentation for boutique wellness brands.
              </p>
            </Card>

            <Card variant="bordered" padding="lg" className={styles.industryCard}>
              <span className={styles.indIcon}>🏋️</span>
              <h3>Athletic Clubs & Gyms</h3>
              <p>
                Heavy-duty towel turnaround, antimicrobial washing, and automated pickup schedules matched to peak hours.
              </p>
            </Card>

            <Card variant="bordered" padding="lg" className={styles.industryCard}>
              <span className={styles.indIcon}>🏨</span>
              <h3>Boutique Hotels & Airbnbs</h3>
              <p>
                Linen turnover, premium duvet pressing, express guest dry cleaning with door-to-door concierge delivery.
              </p>
            </Card>

            <Card variant="bordered" padding="lg" className={styles.industryCard}>
              <span className={styles.indIcon}>🏢</span>
              <h3>Corporate & Uniforms</h3>
              <p>
                Team garment accounts with per-employee item tagging, executive dry cleaning, and consolidated invoicing.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Concrete B2B Service Outcomes */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <span className={styles.badgeGold}>Contracted Delivery</span>
            <h2 className={styles.sectionHeading}>Six Concrete Enterprise Deliverables</h2>
            <p className={styles.sectionSubheading}>
              Every commercial contract is backed by measurable deliverables designed for procurement and operations leads.
            </p>
          </div>

          <div className={styles.outcomesGrid}>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}>🚐</span>
              <h4>Dedicated Route Schedules</h4>
              <p>Reliable recurring pickup and delivery windows tuned to your business shift changes and peak hours.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}>📄</span>
              <h4>Consolidated Monthly Invoicing</h4>
              <p>One itemized monthly statement categorized by location, department, or team member with Net-30 terms.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}>🏷️</span>
              <h4>Garment-Level Barcoding &amp; Tracking</h4>
              <p>Full chain of custody: barcode tracking, high-resolution intake photography, and digital condition logging.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}>⏱️</span>
              <h4>Guaranteed Turnaround SLA</h4>
              <p>Contractually committed 24-hour, 48-hour, or same-day turnaround backed by service credit penalty guarantees.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}>🤝</span>
              <h4>Dedicated Commercial Support</h4>
              <p>A named commercial account manager with direct telephone and WhatsApp escalation lines.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}>📉</span>
              <h4>Volume-Tiered Rate Cards</h4>
              <p>Predictable tiered pricing that scales down your per-pound and per-garment costs as volume grows.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Certification Advantage */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={styles.certContent}>
            <span className={styles.badgeGold}>Procurement Ready</span>
            <h2 className={styles.certTitle}>Rare Federal & State Certification Stack</h2>
            <p className={styles.certText}>
              Lydia Painting, LLC (d/b/a First Eleven Cleaners) holds active certified status across federal, state, and corporate supplier-diversity portals:
            </p>
            <div className={styles.certGrid}>
              <div className={styles.certBox}>
                <strong>SDVOSB</strong>
                <span>Service-Disabled Veteran-Owned</span>
              </div>
              <div className={styles.certBox}>
                <strong>Texas Veteran-HUB</strong>
                <span>Historically Underutilized Business</span>
              </div>
              <div className={styles.certBox}>
                <strong>MBE / NMSDC</strong>
                <span>Minority Business Enterprise</span>
              </div>
              <div className={styles.certBox}>
                <strong>DBE / NCTRCA</strong>
                <span>Disadvantaged Business Enterprise</span>
              </div>
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
                Tell us about your organization and volume requirements. We deliver customized proposals within 24 hours.
              </p>

              {submitted ? (
                <div className={styles.successState}>
                  <span className={styles.successIcon}>🎉</span>
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
                        onChange={(e) => setIndustry(e.target.value)}
                        className={styles.selectInput}
                      >
                        <option value="salon_spa">Salon / Spa / Wellness</option>
                        <option value="gym_fitness">Gym / Fitness Club</option>
                        <option value="hotel_hospitality">Hotel / Airbnb Operator</option>
                        <option value="corporate_office">Corporate / Executive Office</option>
                        <option value="sports_events">Sports Team / Event Producer</option>
                        <option value="government_institutional">Government / Institutional</option>
                        <option value="other">Other Commercial Need</option>
                      </select>
                    </div>

                    <div className={styles.selectGroup}>
                      <label htmlFor="volumeSelect">Estimated Monthly Volume</label>
                      <select
                        id="volumeSelect"
                        value={volumeEstimate}
                        onChange={(e) => setVolumeEstimate(e.target.value)}
                        className={styles.selectInput}
                      >
                        <option value="under_50">Under 50 lbs / week</option>
                        <option value="weekly_50_150">50 - 150 lbs / week</option>
                        <option value="weekly_150_500">150 - 500 lbs / week</option>
                        <option value="weekly_500_plus">500+ lbs / week (High Volume)</option>
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
