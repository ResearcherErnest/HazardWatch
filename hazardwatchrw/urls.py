
from django.contrib import admin
from django.urls import path
from . import views


urlpatterns = [    # Define your URL patterns here
    path('', views.home, name='home'), 
    # path('dashboard/', views.dashboard, name='dashboard'),
    path('insights/', views.insights, name='insights'),
    # path('dashboard_dp/', views.dashboard_dp, name='dashboard_dp'),  # New dashboard_dp URL
]