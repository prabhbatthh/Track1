import { useEffect, useId } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { AnimatedHeading, AnimatedText, FadeUp, Section, SectionHeading } from '@/components/common';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { apiPost, getErrorMessage } from '@/lib/api';
import { LIBRARY_CONTACT } from '@/constants/contact';
import { isValidEmail } from '@/lib/email';
import { preferredScrollBehavior } from '@/lib/scroll';

import { LibraryMap } from '../components/LibraryMap';

// International-friendly: an optional leading +, then 7-15 digits (spaces/dashes/parens allowed).
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;

const contactUsSchema = z.object({
  name: z.string().min(1, { message: 'contactUs.errors.name' }),
  email: z.string().refine(isValidEmail, { message: 'contactUs.errors.email' }),
  phoneNumber: z.string().regex(PHONE_PATTERN, { message: 'contactUs.errors.phoneNumber' }),
  organization: z.string().min(1, { message: 'contactUs.errors.organization' }),
  subject: z.string().min(1, { message: 'contactUs.errors.subject' }),
  message: z.string().min(10, { message: 'contactUs.errors.message' }),
});

type ContactUsFormValues = z.infer<typeof contactUsSchema>;

const contactCategories = [
  {
    id: 'pricingAndFines',
    email: 'pricing@readingclub.org',
    phone: LIBRARY_CONTACT.phoneDisplay,
  },
  {
    id: 'booksAndClubs',
    email: 'clubs@readingclub.org',
    phone: LIBRARY_CONTACT.phoneDisplay,
  },
  {
    id: 'seatBooking',
    email: 'booking@readingclub.org',
    phone: LIBRARY_CONTACT.phoneDisplay,
  },
  {
    id: 'donations',
    email: 'donations@readingclub.org',
    phone: LIBRARY_CONTACT.phoneDisplay,
  },
];

const faqSections = [
  {
    id: 'membership',
    questions: ['becomeMember', 'renewMembership', 'updateProfile', 'resetPassword'],
  },
  {
    id: 'books',
    questions: ['borrowBook', 'renewBorrowedBook', 'reserveUnavailableBook', 'requestNewBookTitle', 'loseBook'],
  },
  {
    id: 'readingClubs',
    questions: ['joinReadingClub', 'createReadingClub', 'leaveClub', 'clubMeetings'],
  },
  {
    id: 'seatBooking',
    questions: ['reserveSeat', 'cancelReservation', 'seatUnavailable', 'bookingLimit'],
  },
  {
    id: 'finesPayments',
    questions: ['overdueFines', 'payFines', 'waiveFine'],
  },
  {
    id: 'donations',
    questions: ['donateBooks', 'donationCondition', 'donateFunds', 'donationReceipt'],
  },
  {
    id: 'events',
    questions: ['registerEvents', 'volunteer', 'organizeEvent'],
  },
];

export function ContactUsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const messageFieldId = useId();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactUsFormValues>({
    resolver: zodResolver(contactUsSchema),
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
      organization: '',
      subject: '',
      message: '',
    },
  });

  useEffect(() => {
    const hash = location.hash?.slice(1);
    if (!hash) return;

    const section = document.getElementById(hash);
    if (!section) return;

    section.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
  }, [location.hash]);

  async function onSubmit(values: ContactUsFormValues) {
    try {
      await apiPost('/contact', {
        name: values.name,
        email: values.email,
        phone_number: values.phoneNumber,
        organization: values.organization,
        subject: values.subject,
        message: values.message,
      });
      toast.success(t('contactUs.toasts.success'));
      reset();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  function scrollToSection(id: string) {
    const element = document.getElementById(id);
    if (!element) return;

    element.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
  }

  function renderAnswer(answer: string) {
    return answer.split('\n').map((line, index) => (
      <p key={index} className={index === 0 ? 'mt-0 text-sm text-muted-foreground' : 'mt-3 text-sm text-muted-foreground'}>
        {line}
      </p>
    ));
  }

  return (
    <>
      <Section
        ariaLabelledBy="contact-us-hero-heading"
        tone="surface"
        size="3xl"
        spacing="py-20 md:py-28"
        containerClassName="text-center"
      >
        <AnimatedHeading as="h1" size="hero" id="contact-us-hero-heading" className="text-4xl md:text-5xl">
          {t('contactUs.hero.heading')}
        </AnimatedHeading>
        <AnimatedText size="lg" spacing={false} delay={1} className="mx-auto mt-5 max-w-xl">
          {t('contactUs.hero.subheading')}
        </AnimatedText>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {(['quickResponses', 'dedicatedSupportTeams', 'multilingualAssistance'] as const).map((key, index) => (
            <FadeUp key={key} delay={index + 2}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-sm font-medium text-foreground">
                <CheckCircle2 className="size-4 text-success" />
                {t(`contactUs.hero.badges.${key}`)}
              </span>
            </FadeUp>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button variant="outline" size="md" type="button" onClick={() => scrollToSection('faq')}>
            {t('contactUs.quickNav.faq')}
          </Button>
          <Button variant="outline" size="md" type="button" onClick={() => scrollToSection('contact-us')}>
            {t('contactUs.quickNav.contactUs')}
          </Button>
          <Button variant="outline" size="md" type="button" onClick={() => scrollToSection('department-contacts')}>
            {t('contactUs.quickNav.departmentContacts')}
          </Button>
        </div>
      </Section>

      <Section id="faq" ariaLabelledBy="faq-heading" tone="surface" className="bg-surface" spacing="pt-12 pb-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12">
          <SectionHeading
            id="faq-heading"
            title={t('contactUs.faq.heading')}
            description={t('contactUs.faq.description')}
            headingClassName="max-w-3xl"
          />

          <div className="grid gap-8">
            {faqSections.map((section) => (
              <div key={section.id} className="rounded-3xl border border-border bg-surface p-6 shadow-panel">
                <h2 className="text-lg font-semibold text-foreground md:text-xl">
                  {t(`contactUs.faq.categories.${section.id}`)}
                </h2>
                <div className="mt-4 space-y-3">
                  {section.questions.map((questionId) => {
                    const question = t(`contactUs.faq.items.${questionId}.question`);
                    const answer = t(`contactUs.faq.items.${questionId}.answer`);

                    return (
                      <details
                        key={questionId}
                        className="overflow-hidden rounded-2xl border border-border-muted bg-secondary/10"
                      >
                        <summary className="cursor-pointer px-4 py-4 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-base">
                          {question}
                        </summary>
                        <div className="px-4 pb-4 pt-2 text-sm text-muted-foreground md:text-base">
                          {renderAnswer(answer)}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-border bg-secondary/10 p-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              {t('contactUs.stillNeedHelp.title')}
            </p>
            <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto">
              {t('contactUs.stillNeedHelp.description')}
            </p>
          </div>
        </div>
      </Section>

      <Section ariaLabelledBy="contact-us-heading" className="bg-surface" spacing="pt-12 pb-12">
        {/* Grid: form and department contacts side-by-side on md+, stacked on small screens */}
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 md:grid-cols-2 items-start">
          {/* Contact form column */}
          <div id="contact-us" className="w-full">
            <Card className="rounded-3xl border-border bg-surface shadow-panel">
              <CardHeader>
                <CardTitle id="contact-us-heading">{t('contactUs.form.heading')}</CardTitle>
                <CardDescription>{t('contactUs.form.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
                  <Input
                    label={t('contactUs.form.name')}
                    autoComplete="name"
                    error={errors.name?.message ? t(errors.name.message) : undefined}
                    {...register('name')}
                  />
                  <Input
                    label={t('contactUs.form.email')}
                    type="email"
                    autoComplete="email"
                    error={errors.email?.message ? t(errors.email.message) : undefined}
                    {...register('email')}
                  />
                  <Input
                    label={t('contactUs.form.phoneNumber')}
                    type="tel"
                    autoComplete="tel"
                    error={errors.phoneNumber?.message ? t(errors.phoneNumber.message) : undefined}
                    {...register('phoneNumber')}
                  />
                  <Input
                    label={t('contactUs.form.organization')}
                    type="text"
                    autoComplete="organization"
                    error={errors.organization?.message ? t(errors.organization.message) : undefined}
                    {...register('organization')}
                  />
                  <Input
                    label={t('contactUs.form.subject')}
                    type="text"
                    autoComplete="off"
                    error={errors.subject?.message ? t(errors.subject.message) : undefined}
                    {...register('subject')}
                  />
                  <Textarea
                    id={messageFieldId}
                    label={t('contactUs.form.message')}
                    rows={5}
                    className="min-h-[12rem]"
                    error={errors.message?.message ? t(errors.message.message) : undefined}
                    {...register('message')}
                  />
                  <Button type="submit" isLoading={isSubmitting}>
                    {t('contactUs.form.submitButton')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Department contacts column */}
          <div id="department-contacts" className="w-full">
            <Card className="overflow-hidden rounded-3xl border-border bg-surface shadow-panel">
              <CardHeader>
                <CardTitle>{t('contactUs.table.heading')}</CardTitle>
                <CardDescription>{t('contactUs.table.description')}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table className="min-w-full">
                  <TableCaption>{t('contactUs.table.caption')}</TableCaption>
                  <TableHeader>
                    <TableRow className="bg-primary/10">
                      <TableHead className="text-foreground">{t('contactUs.table.category')}</TableHead>
                      <TableHead className="text-foreground">{t('contactUs.table.email')}</TableHead>
                      <TableHead className="text-foreground">{t('contactUs.table.phone')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactCategories.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell>{t(`contactUs.table.${contact.id}`)}</TableCell>
                        <TableCell>
                          <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                            {contact.email}
                          </a>
                        </TableCell>
                        <TableCell>
                          <a
                            href={`tel:${contact.phone.replace(/[^+0-9]/g, '')}`}
                            className="text-foreground hover:text-primary"
                            aria-label={`${t(`contactUs.table.${contact.id}`)} phone ${contact.phone}`}
                          >
                            {contact.phone}
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="mt-6 rounded-3xl border-border bg-surface shadow-panel">
              <CardHeader>
                <CardTitle>{t('contactUs.map.title')}</CardTitle>
                <CardDescription>{t('contactUs.map.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <LibraryMap />
              </CardContent>
            </Card>
          </div>
        </div>
      </Section>
    </>
  );
}
