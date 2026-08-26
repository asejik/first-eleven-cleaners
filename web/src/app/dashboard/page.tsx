'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useCustomerOrders } from '@/hooks/useOrders';
import { useCustomerClaims } from '@/hooks/useClaims';
import { Button, Card, Badge, Skeleton } from '@/components/ui';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { ROUTES, ORDER_STATUSES } from '@/lib/constants';
import styles from './page.module.css';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useCustomerOrders();
  const { data: claimsData } = useCustomerClaims();

  const orders = data?.orders || [];
  const activeOrders = orders.filter((o) => o.status !== 'delivered');
  const completedOrders = orders.filter((o) => o.status === 'delivered');
  const claims = claimsData?.claims || [];

  return (
    <AuthGuard>
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Top Welcome Bar */}
          <div className={styles.topBar}>
            <div>
              <span className={styles.welcomeSubtitle}>Customer Portal</span>
              <h1 className={styles.welcomeTitle}>
                Welcome back, {user?.full_name?.split(' ')[0] || 'Friend'} ⚽
              </h1>
            </div>
            <div className={styles.topActions}>
              <Link href={ROUTES.addresses}>
                <Button variant="outline" size="md">
                  📍 Addresses
                </Button>
              </Link>
              <Link href={ROUTES.profile}>
                <Button variant="outline" size="md">
                  👤 Profile
                </Button>
              </Link>
              <Link href={ROUTES.book}>
                <Button variant="primary" size="md">
                  + Schedule Pickup
                </Button>
              </Link>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className={styles.statsGrid}>
            <Card variant="bordered" padding="md" className={styles.statCard}>
              <span className={styles.statIcon}>🚐</span>
              <div>
                <p className={styles.statLabel}>Active Orders</p>
                <p className={styles.statNumber}>{isLoading ? '...' : activeOrders.length}</p>
              </div>
            </Card>

            <Card variant="bordered" padding="md" className={styles.statCard}>
              <span className={styles.statIcon}>✨</span>
              <div>
                <p className={styles.statLabel}>Total Orders</p>
                <p className={styles.statNumber}>{isLoading ? '...' : orders.length}</p>
              </div>
            </Card>

            <Card variant="bordered" padding="md" className={styles.statCard}>
              <span className={styles.statIcon}>⚙️</span>
              <div>
                <p className={styles.statLabel}>Eleven&apos;s Memory</p>
                <Link href={ROUTES.preferences} className={styles.statLink}>
                  Manage Preferences →
                </Link>
              </div>
            </Card>

            <Card variant="bordered" padding="md" className={styles.statCard}>
              <span className={styles.statIcon}>🛡️</span>
              <div>
                <p className={styles.statLabel}>Make It Right</p>
                {claims.length > 0 ? (
                  <Link href={ROUTES.claim(claims[0].order_id)} className={styles.statLink} style={{ color: 'var(--color-gold-dark)', fontWeight: 'bold' }}>
                    {claims.length} {claims.length === 1 ? 'Claim Active' : 'Claims Active'} →
                  </Link>
                ) : (
                  <p className={styles.statNumber} style={{ fontSize: 'var(--text-base)', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                    100% Guaranteed
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Active Orders Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Active Orders & Live Tracking</h2>
              <span className={styles.countBadge}>{activeOrders.length} in progress</span>
            </div>

            {isLoading ? (
              <div className={styles.ordersList}>
                <Skeleton height="120px" borderRadius="var(--radius-xl)" />
                <Skeleton height="120px" borderRadius="var(--radius-xl)" />
              </div>
            ) : activeOrders.length === 0 ? (
              <Card variant="surface" padding="lg" className={styles.emptyState}>
                <span className={styles.emptyIcon}>🧺</span>
                <h3>No Active Pickups Right Now</h3>
                <p>Your laundry basket looking full? Schedule a pickup in under 60 seconds.</p>
                <Link href={ROUTES.book}>
                  <Button variant="primary" style={{ marginTop: 'var(--space-3)' }}>
                    Schedule a Pickup
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className={styles.ordersList}>
                {activeOrders.map((order) => {
                  const statusMeta = ORDER_STATUSES.find((s) => s.key === order.status);
                  return (
                    <Card key={order.id} variant="bordered" padding="md" className={styles.orderCard}>
                      <div className={styles.orderMain}>
                        <div className={styles.orderHead}>
                          <div>
                            <span className={styles.orderId}>Order #{order.order_number || order.id}</span>
                            <span className={styles.orderDate}>
                              Pickup: {order.pickup_date} ({order.pickup_window})
                            </span>
                          </div>
                          <Badge
                            variant={
                              order.status === 'in_cleaning'
                                ? 'cleaning'
                                : order.status === 'out_for_delivery'
                                ? 'out_for_delivery'
                                : order.status === 'weighed_itemized'
                                ? 'weighed'
                                : 'booked'
                            }
                            dot
                          >
                            {statusMeta?.label || order.status}
                          </Badge>
                        </div>

                        <div className={styles.orderSummaryText}>
                          <span>
                            {order.order_type === 'mixed'
                              ? '🧺 Wash & Fold + 👔 Dry Cleaning'
                              : order.order_type === 'dry_clean'
                              ? '👔 Dry Cleaning'
                              : '🧺 Wash & Fold'}
                          </span>
                          <span>•</span>
                          <span>Est. Total: ${order.total.toFixed(2)}</span>
                          {order.weight_lbs && (
                            <>
                              <span>•</span>
                              <span>{order.weight_lbs} lbs</span>
                            </>
                          )}
                        </div>

                        <div className={styles.deliveryEstimate}>
                          ⏱️ <strong>Match-Ready Promise:</strong> Delivery on {order.delivery_date || 'Within 48 hours'}
                        </div>
                      </div>

                      <div className={styles.orderActions}>
                        <Link href={ROUTES.orderDetail(order.id)}>
                          <Button variant="primary" size="sm">
                            Live Tracker & Photos →
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past Orders History */}
          {completedOrders.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Completed Orders & Garment Passports</h2>
              <div className={styles.ordersList}>
                {completedOrders.map((order) => (
                  <Card key={order.id} variant="bordered" padding="md" className={styles.orderCard}>
                    <div className={styles.orderMain}>
                      <div className={styles.orderHead}>
                        <div>
                          <span className={styles.orderId}>Order #{order.order_number || order.id}</span>
                          <span className={styles.orderDate}>Delivered on {order.delivery_date}</span>
                        </div>
                        <Badge variant="delivered" dot>
                          Delivered
                        </Badge>
                      </div>
                      <div className={styles.orderSummaryText}>
                        <span>Total Paid: ${order.total.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className={styles.orderActions}>
                      <Link href={ROUTES.orderDetail(order.id)}>
                        <Button variant="outline" size="sm">
                          View Garment Passport
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
