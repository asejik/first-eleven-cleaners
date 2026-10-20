'use client';

import { useState, type FormEvent } from 'react';
import { Award, Building2, CircleCheck, Dumbbell, FileText, Handshake, Hotel, Medal, Scissors, Star, Tag, TrendingDown, Truck, Zap } from 'lucide-react';
import { Button, Input, Card, Icon } from '@/components/ui';
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
          <h1 className={styles.heroTitle}>Commercial Laundry & Dry Cleaning for DFW Businesses</h1>
          <p className={styles.heroSubtitle}>
            Agreed rate cards, recurring pickup schedules, photo-documented intake, and turnaround times
            agreed in writing for Dallas-Fort Worth businesses.
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
            <span className={styles.badgeGold}>Business Accounts</span>
            <h2 className={styles.sectionHeading}>What Every Business Account Includes</h2>
            <p className={styles.sectionSubheading}>
              Your schedule, rates, and turnaround are set out in writing before the first pickup.
            </p>
          </div>

          <div className={styles.outcomesGrid}>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={Truck} size={28} strokeWidth={1.5} /></span>
              <h4>Dedicated Route Schedules</h4>
              <p>Reliable recurring pickup and delivery windows tuned to your business shift changes and peak hours.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={FileText} size={28} strokeWidth={1.5} /></span>
              <h4>Itemized Billing</h4>
              <p>Every order itemized, with billing terms agreed in your service agreement.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={Tag} size={28} strokeWidth={1.5} /></span>
              <h4>Photo-Documented Intake &amp; Tracking</h4>
              <p>Intake photos, condition notes, and live order tracking from pickup to delivery.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}>⏱️</span>
              <h4>Turnaround Agreed in Writing</h4>
              <p>Your turnaround time is set out in your service agreement, so everyone works to the same commitment.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={Handshake} size={28} strokeWidth={1.5} /></span>
              <h4>Dedicated Commercial Support</h4>
              <p>A direct contact for your account by phone and email.</p>
            </div>
            <div className={styles.outcomeCard}>
              <span className={styles.outcomeIcon}><Icon icon={TrendingDown} size={28} strokeWidth={1.5} /></span>
              <h4>Volume Rate Cards</h4>
              <p>Rates quoted for your volume, agreed before your first pickup.</p>
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
                Tell us about your organization and volume requirements. We deliver customized proposals within 24 hours.
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
