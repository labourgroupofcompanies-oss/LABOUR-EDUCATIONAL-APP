-- Seed Simple FAQs for Labour Edu
-- This script populates the faqs table with simplified, easy-to-read answers.

TRUNCATE public.faqs; -- Clear old complex ones

INSERT INTO public.faqs (question, answer, display_order)
VALUES 
(
    'What is Labour Edu?', 
    'It is a simple app that helps you manage your school students, staff, and results in one place.',
    1
),
(
    'Can I use it without internet?', 
    'Yes. You can do all your work offline, and the app will sync to the cloud automatically when you get internet.',
    2
),
(
    'How do I register my school?', 
    'Just fill the "Get Started" form on our website. We will review it and send you a code to join.',
    3
),
(
    'Is my school data safe?', 
    'Yes. Your data is encrypted and private. Only your authorized staff can see your school records.',
    4
),
(
    'What computer do I need?', 
    'Any laptop or desktop with Windows, Mac, or Linux will work. It is very lightweight.',
    5
),
(
    'How do I pay for a subscription?', 
    'You can pay via Mobile Money (MoMo) or Bank. Once you pay, send us the reference and we will activate your account.',
    6
);
