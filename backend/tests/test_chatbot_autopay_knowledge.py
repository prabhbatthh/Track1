from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.constants import Role
from app.modules.chat.knowledge import find_rag_answer
from app.modules.chat import orchestrator
from app.modules.chat.orchestrator import _system_prompt, get_guardian_autopay_policy
from app.modules.guardian_autopay.schemas import AutopayPolicyOut


@pytest.mark.asyncio
async def test_tool_get_guardian_autopay_policy_security_and_scoping():
    """1. Test security: Only GUARDIAN role can access live policy via ContextVar auth context."""
    # A) Non-guardian role rejected
    orchestrator._ctx.set({"member_id": "member_123", "role": Role.MEMBER.value})
    res_member = await get_guardian_autopay_policy.ainvoke({})
    assert "only available for Guardian accounts" in res_member

    # B) Guardian role with policy
    orchestrator._ctx.set({"member_id": "guardian_123", "role": Role.GUARDIAN.value})
    fake_policy = AutopayPolicyOut(
        id="pol_1",
        guardian_id="guardian_123",
        member_id="child_1",
        enabled=True,
        per_transaction_cap=350,
        monthly_spending_cap=1500,
        allowed_charge_types=["fine"],
    )
    with patch("app.modules.guardian_autopay.service.get_guardian_active_policy", return_value=fake_policy):
        res_guardian = await get_guardian_autopay_policy.ainvoke({})
        assert '"per_transaction_cap": 350' in res_guardian
        assert '"monthly_spending_cap": 1500' in res_guardian
        assert '"enabled": true' in res_guardian


def test_rag_routing_personalized_queries_bypass_static_rag():
    """2. Verify personalized policy queries return None from RAG so ReAct LLM Agent handles them with live tool."""
    personalized_queries = [
        "how do i pay 400 fine then",
        "my fine is ₹400, how do I pay it?",
        "how do i increase my fine limit",
        "how do i change my monthly limit",
        "why didn't AI pay my fine",
        "why was my payment blocked",
    ]
    for q in personalized_queries:
        ans = find_rag_answer(q)
        assert ans is None, f"Expected RAG answer to be None for personalized query '{q}' so tool is called"


def test_rag_conceptual_queries_use_static_rag():
    """3. Verify static conceptual questions still return clean static RAG answers."""
    conceptual_queries = [
        "What is AI Guardian Auto-Pay?",
        "Is Auto-Pay a subscription?",
        "How does Auto-Pay work?",
        "How do I pay a fine?",
    ]
    for q in conceptual_queries:
        ans = find_rag_answer(q)
        assert ans is not None, f"Expected static RAG answer for '{q}'"
        assert "1-month" not in ans.lower()
        assert "Settings → Payment Settings" not in ans.lower()


def test_no_hardcoded_personalized_values_in_system_prompt():
    """4. Verify LLM System Prompt instructs using live get_guardian_autopay_policy tool."""
    prompt = _system_prompt("Test Guardian", "guardian", "user_123")
    assert "ALWAYS call the get_guardian_autopay_policy tool" in prompt
    assert "Compare fine amount against the retrieved per_transaction_cap" in prompt
    assert "Review & Pay Fines → Approve & Pay" in prompt


@pytest.mark.asyncio
async def test_membership_vs_autopay_chatbot_routing():
    """5. Verify explicit separation of Membership Subscription Intent vs Auto-Pay Intent."""
    from datetime import UTC, datetime
    from app.modules.pricing_plans.schemas import PricingPlanOut

    now = datetime.now(UTC)
    fake_plans = [
        PricingPlanOut(id="p1", plan_id="1m", months=1, price=299, save_percent=0, badge=None, updated_at=now),
        PricingPlanOut(id="p2", plan_id="3m", months=3, price=799, save_percent=11, badge=None, updated_at=now),
        PricingPlanOut(id="p3", plan_id="6m", months=6, price=1499, save_percent=16, badge="Popular", updated_at=now),
        PricingPlanOut(id="p4", plan_id="12m", months=12, price=2699, save_percent=25, badge="Best Value", updated_at=now),
    ]

    with patch("app.modules.pricing_plans.service.list_plans", return_value=fake_plans), \
         patch("app.modules.agent_upsell.service.evaluate_upsell", side_effect=Exception("DB not connected")):
        # 1. Membership plan queries must NOT return off-topic refusal
        membership_queries = [
            "which is best subscription plan for me and why",
            "how much does a 12 month membership cost",
            "which membership plan should I choose",
            "which plan gives the best discount",
        ]
        for q in membership_queries:
            res = await orchestrator.run_chat(
                message=q,
                history=[],
                member_id="mem_test",
                user_name="Test Member",
                role="member",
            )
            assert "I can only help with library-related topics" not in res.reply, f"Membership query '{q}' returned off-topic refusal"
            assert res.source in ["tag", "llm", "rag"], f"Expected valid source for '{q}' but got {res.source}"

    # 2. Auto-Pay conceptual queries remain in Auto-Pay domain and do NOT invoke get_pricing_plans
    ans_sub = find_rag_answer("is Auto-Pay a subscription?")
    assert ans_sub is not None
    assert "No. AI Guardian Auto-Pay is not a membership subscription" in ans_sub

    ans_pay = find_rag_answer("how do I pay my ₹400 fine?")
    assert ans_pay is None  # Bypasses static RAG to execute live policy tool via ReAct agent


@pytest.mark.asyncio
async def test_conversational_followup_autopay_context():
    """6. Verify conversational follow-up pronoun resolution and domain context matching."""
    from datetime import UTC, datetime
    from app.modules.chat.schemas import ChatMessage
    from app.modules.pricing_plans.schemas import PricingPlanOut

    now = datetime.now(UTC)
    fake_plans = [
        PricingPlanOut(id="p1", plan_id="1m", months=1, price=299, save_percent=0, badge=None, updated_at=now),
        PricingPlanOut(id="p2", plan_id="3m", months=3, price=799, save_percent=11, badge=None, updated_at=now),
        PricingPlanOut(id="p3", plan_id="6m", months=6, price=1499, save_percent=16, badge="Popular", updated_at=now),
        PricingPlanOut(id="p4", plan_id="12m", months=12, price=2699, save_percent=25, badge="Best Value", updated_at=now),
    ]

    with patch("app.modules.pricing_plans.service.list_plans", return_value=fake_plans), \
         patch("app.modules.agent_upsell.service.evaluate_upsell", side_effect=Exception("DB not connected")):

        # TEST 1: Auto-Pay subscription question followed by "what do i do with it?"
        h1 = [
            ChatMessage(role="user", content="Is Auto-Pay a subscription?"),
            ChatMessage(role="assistant", content="No. AI Guardian Auto-Pay is not a membership subscription..."),
        ]
        res1 = await orchestrator.run_chat(
            message="what do i do with it?",
            history=h1,
            member_id="g1",
            user_name="Test Guardian",
            role="guardian",
        )
        assert "1-month" not in res1.reply.lower()
        assert "12-month" not in res1.reply.lower()
        assert "auto-pay" in res1.reply.lower() or "fine" in res1.reply.lower() or "limits" in res1.reply.lower()

        # TEST 2: "What is AI Guardian Auto-Pay?" followed by "how do I use it?"
        h2 = [
            ChatMessage(role="user", content="What is AI Guardian Auto-Pay?"),
            ChatMessage(role="assistant", content="AI Guardian Auto-Pay lets you allow AI to settle eligible library fines..."),
        ]
        res2 = await orchestrator.run_chat(
            message="how do I use it?",
            history=h2,
            member_id="g1",
            user_name="Test Guardian",
            role="guardian",
        )
        assert "1-month" not in res2.reply.lower()
        assert "12-month" not in res2.reply.lower()
        assert "auto-pay" in res2.reply.lower() or "limit" in res2.reply.lower()

        # TEST 3: Standalone "Which subscription plan is best for me?"
        res3 = await orchestrator.run_chat(
            message="Which subscription plan is best for me?",
            history=[],
            member_id="m1",
            user_name="Test Member",
            role="member",
        )
        assert "12-month" in res3.reply.lower() or "subscription" in res3.reply.lower()

        # TEST 4: "Is Auto-Pay a subscription?" followed by topic switch "what about the 12 month plan?"
        h4 = [
            ChatMessage(role="user", content="Is Auto-Pay a subscription?"),
            ChatMessage(role="assistant", content="No. AI Guardian Auto-Pay is not a membership subscription..."),
        ]
        res4 = await orchestrator.run_chat(
            message="what about the 12 month plan?",
            history=h4,
            member_id="m1",
            user_name="Test Member",
            role="member",
        )
        assert "12-month" in res4.reply.lower() or "2,699" in res4.reply or "2699" in res4.reply

        # TEST 5: Fine query "How do I pay my ₹400 fine?"
        res5 = await orchestrator.run_chat(
            message="How do I pay my ₹400 fine?",
            history=[],
            member_id="g1",
            user_name="Test Guardian",
            role="guardian",
        )
        assert "1-month" not in res5.reply.lower()
        assert "12-month" not in res5.reply.lower()
        assert "fine" in res5.reply.lower() or "pay" in res5.reply.lower()



