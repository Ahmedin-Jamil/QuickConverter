"""
CategoryMapper - Rule-Based Transaction Categorization Engine.

Provides transparent, deterministic categorization using keyword matching.
No AI/ML dependencies - pure pattern matching for full auditability.

Categories are configurable and traceable in code.
"""
from typing import Optional


# ─────────────────────────────────────────────────────────────
# Category Rules Configuration
# ─────────────────────────────────────────────────────────────
# This is the single source of truth for categorization.
# Rules are applied in order; first match wins.

CATEGORY_RULES = {
    "Transport": [
        "uber", "lyft", "taxi", "transit", "metro", "fuel", "gas station",
        "shell", "chevron", "exxon", "bp", "parking", "toll", "railway",
        "amtrak", "greyhound", "bus", "airline", "flight"
    ],
    "Meals": [
        "starbucks", "mcdonald", "restaurant", "doordash", "grubhub",
        "uber eats", "chipotle", "subway", "pizza", "coffee", "cafe",
        "dunkin", "wendy", "burger", "taco", "diner", "bakery", "food"
    ],
    "Utilities": [
        "electric", "water bill", "gas bill", "internet", "comcast",
        "verizon", "at&t", "t-mobile", "spectrum", "utility", "power",
        "sewage", "waste management", "trash"
    ],
    "Subscriptions": [
        "netflix", "spotify", "amazon prime", "subscription", "hulu",
        "disney+", "hbo", "apple music", "youtube premium", "membership",
        "gym", "fitness", "adobe", "microsoft 365"
    ],
    "Transfers": [
        "transfer", "zelle", "venmo", "paypal", "wire transfer",
        "ach transfer", "internal transfer", "account transfer"
    ],
    "ATM/Cash": [
        "atm", "cash withdrawal", "cashback", "cash back", "withdraw"
    ],
    "Income": [
        "payroll", "direct deposit", "salary", "dividend", "interest earned",
        "refund", "reimbursement", "deposit", "credit", "income"
    ],
    "Shopping": [
        "amazon", "walmart", "target", "costco", "best buy", "home depot",
        "lowes", "ikea", "ebay", "etsy", "clothing", "apparel", "store"
    ],
    "Healthcare": [
        "pharmacy", "cvs", "walgreens", "doctor", "hospital", "medical",
        "dental", "vision", "insurance premium", "health"
    ],
    "Fees": [
        "fee", "service charge", "overdraft", "interest charge", "late fee",
        "maintenance fee", "monthly fee", "annual fee"
    ],
}

# Valid categories for schema validation
VALID_CATEGORIES = list(CATEGORY_RULES.keys()) + ["Uncategorized"]


class CategoryMapper:
    """
    Deterministic transaction categorizer using keyword matching.
    
    Usage:
        mapper = CategoryMapper()
        category = mapper.categorize("UBER TRIP SAN FRANCISCO")
        # Returns: "Transport"
    """
    
    def __init__(self, custom_rules: Optional[dict] = None):
        """
        Initialize with default rules, optionally override with custom rules.
        
        Args:
            custom_rules: Optional dict to override default CATEGORY_RULES
        """
        self.rules = custom_rules if custom_rules else CATEGORY_RULES
    
    def categorize(self, description: str) -> str:
        """
        Categorize a transaction based on its description.
        
        Args:
            description: Transaction description text
            
        Returns:
            Category name (str), defaults to "Uncategorized"
        """
        if not description:
            return "Uncategorized"
        
        desc_lower = description.lower()
        
        for category, keywords in self.rules.items():
            for keyword in keywords:
                if keyword in desc_lower:
                    return category
        
        return "Uncategorized"
    
    def get_rules(self) -> dict:
        """Return current categorization rules for transparency/audit."""
        return self.rules.copy()
    
    def get_category_stats(self, transactions: list) -> dict:
        """
        Generate category distribution statistics.
        
        Args:
            transactions: List of Transaction dicts
            
        Returns:
            Dict with category counts
        """
        stats = {cat: 0 for cat in VALID_CATEGORIES}
        
        for tx in transactions:
            cat = tx.get("category", "Uncategorized")
            if cat in stats:
                stats[cat] += 1
            else:
                stats["Uncategorized"] += 1
        
        # Remove zero-count categories for cleaner output
        return {k: v for k, v in stats.items() if v > 0}
