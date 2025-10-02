from django.shortcuts import render


# Rendering my page.
def home(request):
    return render(request, "home.html")

def insights(request):
    return render(request, "insights.html")

# def dashboard(request):
#     return render(request, "dashboard.html")

# def dashboard_dp(request):
#     return render(request, "dashboard_dp.html")
